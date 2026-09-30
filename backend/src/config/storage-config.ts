import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const audioName = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(wav|mp3)$/i;

function repositoryRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (directory !== dirname(directory)) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest)) {
      const content = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown; workspaces?: unknown };
      if (content.name === 'soundry' && Array.isArray(content.workspaces)) return realpathSync(directory);
    }
    directory = dirname(directory);
  }
  throw new Error('REPOSITORY_ROOT_UNAVAILABLE');
}

export const REPOSITORY_ROOT = repositoryRoot();

function statIfPresent(path: string) {
  try { return lstatSync(path); }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

// Check every existing component before creating/opening anything. An explicitly
// configured directory may be outside the repository, but cannot redirect via links.
function assertNoSymlinks(path: string): void {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of absolute.slice(current.length).split('/')) {
    current = join(current, part);
    const info = statIfPresent(current);
    if (info?.isSymbolicLink()) throw new Error('UNSAFE_STORAGE_PATH');
  }
}

export class StorageConfig {
  readonly root: string;
  readonly databasePath: string;
  readonly audioDirectory: string;
  readonly tempDirectory: string;

  constructor(dataDir: string | undefined = process.env.SOUNDRY_DATA_DIR) {
    if (dataDir !== undefined && (!dataDir.trim() || dataDir.includes('\0'))) throw new Error('INVALID_DATA_DIRECTORY');
    this.root = resolve(REPOSITORY_ROOT, dataDir ?? 'data');
    this.databasePath = join(this.root, 'soundry.db');
    this.audioDirectory = join(this.root, 'audio');
    this.tempDirectory = join(this.root, 'temp');
    this.assertSafe();
    for (const directory of [this.root, this.audioDirectory, this.tempDirectory]) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const info = lstatSync(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('UNSAFE_STORAGE_PATH');
    }
    this.assertSafe();
    if (!existsSync(this.databasePath)) {
      const fd = openSync(this.databasePath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      closeSync(fd);
    }
  }

  assertSafe(): void {
    for (const directory of [this.root, this.audioDirectory, this.tempDirectory]) {
      assertNoSymlinks(directory);
      const info = statIfPresent(directory);
      if (info && !info.isDirectory()) throw new Error('UNSAFE_STORAGE_PATH');
    }
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const path = this.databasePath + suffix;
      assertNoSymlinks(path);
      const info = statIfPresent(path);
      if (info && (!info.isFile() || info.nlink !== 1)) throw new Error('UNSAFE_STORAGE_PATH');
    }
  }

  /** Check only the owned temporary subtree so unrelated audio failures cannot block its cleanup. */
  assertSafeTemp(): void {
    for (const directory of [this.root, this.tempDirectory]) {
      assertNoSymlinks(directory);
      if (!lstatSync(directory).isDirectory()) throw new Error('UNSAFE_STORAGE_PATH');
    }
  }

  resolveAudioPath(relativePath: string): string {
    if (isAbsolute(relativePath) || !relativePath.startsWith('audio/') || !audioName.test(relativePath.slice(6))) {
      throw new Error('UNSAFE_AUDIO_PATH');
    }
    this.assertSafe();
    const path = join(this.audioDirectory, relativePath.slice(6));
    const info = statIfPresent(path);
    if (info && (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)) throw new Error('UNSAFE_AUDIO_PATH');
    return path;
  }

  removeAudio(relativePath: string): boolean {
    try {
      const path = this.resolveAudioPath(relativePath);
      if (statIfPresent(path)) unlinkSync(path);
      return true;
    } catch { return false; }
  }

  /** Called only after the database connection owns the data-root lock. */
  removeStaleTemp(): boolean {
    this.assertSafe();
    let pending = false;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const entry of readdirSync(this.tempDirectory, { withFileTypes: true })) {
      if (!uuid.test(entry.name)) { pending = true; continue; }
      const directory = join(this.tempDirectory, entry.name);
      if (!entry.isDirectory() || entry.isSymbolicLink()) { pending = true; continue; }
      try {
        for (const part of readdirSync(directory, { withFileTypes: true })) {
          if (!part.name.endsWith('.part') || !uuid.test(part.name.slice(0, -5))) { pending = true; continue; }
          const path = join(directory, part.name);
          const info = lstatSync(path);
          if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) { pending = true; continue; }
          unlinkSync(path);
        }
        rmdirSync(directory);
      } catch { pending = true; }
    }
    return pending;
  }

  removeOrphanAudio(referencedPaths: ReadonlySet<string>): boolean {
    this.assertSafe();
    let cleanupPending = false;
    for (const entry of readdirSync(this.audioDirectory, { withFileTypes: true })) {
      const relativePath = `audio/${entry.name}`;
      if (!audioName.test(entry.name)) continue;
      if (!referencedPaths.has(relativePath) && !this.removeAudio(relativePath)) cleanupPending = true;
    }
    return cleanupPending;
  }
}
