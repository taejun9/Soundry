import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPOSITORY_ROOT, StorageConfig } from '../config/storage-config.js';
import { DatabaseService } from './database.service.js';
let root: string;
let owner: DatabaseService | undefined;
beforeEach(() => { root = mkdtempSync('/private/tmp/soundry-owner-'); });
afterEach(() => { owner?.onApplicationShutdown(); owner = undefined; vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

describe('single data-root owner and restart cleanup', () => {
  it('blocks another process before cleanup and releases ownership on shutdown', () => {
    const storage = new StorageConfig(root);
    owner = new DatabaseService(storage);
    const id = randomUUID(); const audio = join(storage.audioDirectory, `${id}.wav`); writeFileSync(audio, 'in-flight bytes');
    const directory = join(storage.tempDirectory, randomUUID()); mkdirSync(directory); const part = join(directory, `${randomUUID()}.part`); writeFileSync(part, 'in-flight bytes');
    const script = `import 'reflect-metadata'; import { StorageConfig } from ${JSON.stringify(join(REPOSITORY_ROOT, 'backend/src/config/storage-config.ts'))}; import { DatabaseService } from ${JSON.stringify(join(REPOSITORY_ROOT, 'backend/src/database/database.service.ts'))}; try { const db = new DatabaseService(new StorageConfig(${JSON.stringify(root)})); db.onApplicationShutdown(); process.stdout.write('opened'); } catch(error) { process.stdout.write(error.message); }`;
    const result = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { cwd: join(REPOSITORY_ROOT, 'backend'), encoding: 'utf8', timeout: 5000 });
    expect(result).toBe('DATA_DIRECTORY_IN_USE');
    expect(readFileSync(audio, 'utf8')).toBe('in-flight bytes');
    expect(readFileSync(part, 'utf8')).toBe('in-flight bytes');
    expect(owner.client.prepare('SELECT count(*) AS count FROM projects').get()).toEqual({ count: 0 });
    owner.onApplicationShutdown(); owner = new DatabaseService(storage);
    expect(existsSync(audio)).toBe(false);
    expect(readdirSync(storage.tempDirectory)).toEqual([]);
  });

  it('cleans only recognized owned temporary files and preserves links and unknown files', () => {
    const storage = new StorageConfig(root);
    const directory = join(storage.tempDirectory, randomUUID()); mkdirSync(directory);
    const part = join(directory, `${randomUUID()}.part`); writeFileSync(part, 'stale');
    const sentinel = join(directory, 'keep.txt'); writeFileSync(sentinel, 'preserve');
    const outside = join(root, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'sentinel'), 'preserve');
    symlinkSync(outside, join(storage.tempDirectory, randomUUID()));
    const outsideFile = join(outside, 'source'); writeFileSync(outsideFile, 'preserve');
    linkSync(outsideFile, join(directory, `${randomUUID()}.part`));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    owner = new DatabaseService(storage);
    expect(existsSync(part)).toBe(false);
    expect(readFileSync(sentinel, 'utf8')).toBe('preserve');
    expect(readFileSync(outsideFile, 'utf8')).toBe('preserve');
    expect(readFileSync(join(outside, 'sentinel'), 'utf8')).toBe('preserve');
    expect(warning).toHaveBeenCalled();
  });
});
