/**
 * 저장 루트와 모든 영속 파일 경로를 소유하는 안전 경계다. 상대 설정은 실행 cwd가 아닌 저장소 루트를 기준으로 해석한다.
 * UUID 음원만 다루며 링크·다중 hardlink·예상 밖 파일은 신뢰하지 않는다. 삭제 실패는 데이터 정리 보류로 보고한다.
 */
import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const audioName = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(wav|mp3)$/i;

// 개발 소스와 빌드 출력에서 모두 위로 이동해 workspace manifest를 찾으므로 실행 위치가 바뀌어도 data 기준이 같다.
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

// 존재하지 않음만 정상 부재로 취급한다. 권한 오류 등은 삼키지 않아 경로 검사가 실패하도록 한다.
function statIfPresent(path: string) {
  try { return lstatSync(path); }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

// Check every existing component before creating/opening anything. An explicitly
// configured directory may be outside the repository, but cannot redirect via links.
// 최종 파일뿐 아니라 상위 디렉터리도 검사한다. 명시한 외부 저장 루트는 허용하지만 링크를 통한 우회는 거부한다.
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

  // 소유자만 접근하는 디렉터리/DB를 만들고 생성 전후 안전성을 다시 확인한다. 기존 사용자 파일은 교체하지 않는다.
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

  // DB 본체와 SQLite 보조 파일까지 검사한다. 실행 후 경로가 링크로 교체된 상황도 다음 접근에서 차단한다.
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
  // 실패한 batch의 temp 정리는 audio 쪽 문제와 독립적으로 가능해야 하므로 필요한 하위 트리만 확인한다.
  assertSafeTemp(): void {
    for (const directory of [this.root, this.tempDirectory]) {
      assertNoSymlinks(directory);
      if (!lstatSync(directory).isDirectory()) throw new Error('UNSAFE_STORAGE_PATH');
    }
  }

  // DB의 상대 경로도 신뢰하지 않는다. audio/UUID.확장자 이외의 절대 경로·중첩 경로·traversal은 거부한다.
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

  // 없어진 파일 삭제는 성공으로 취급하고 안전성/권한 실패는 false로 반환해 DB 삭제 결과에 경고를 붙일 수 있게 한다.
  removeAudio(relativePath: string): boolean {
    try {
      const path = this.resolveAudioPath(relativePath);
      if (statIfPresent(path)) unlinkSync(path);
      return true;
    } catch { return false; }
  }

  /** Called only after the database connection owns the data-root lock. */
  // DB 독점 잠금을 얻은 시작 과정에서만 호출한다. UUID 작업 폴더의 단일 링크 .part 파일만 제거한다.
  // 모르는 항목은 보존하고 pending을 반환해 다른 프로세스나 사용자가 만든 파일을 지우지 않는다.
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

  // DB 참조가 사라진 앱 형식의 음원만 정리한다. 임의 이름 파일과 현재 참조 중인 파일은 그대로 보존한다.
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
