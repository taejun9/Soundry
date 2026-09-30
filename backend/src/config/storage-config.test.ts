import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { REPOSITORY_ROOT, StorageConfig } from './storage-config.js';

let directory: string;
beforeEach(() => { directory = mkdtempSync('/private/tmp/soundry-storage-'); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

describe('StorageConfig path boundary', () => {
  it('resolves relative data directories from the repository even with another cwd', () => {
    const destination = join(directory, 'data');
    const configured = relative(REPOSITORY_ROOT, destination);
    const modulePath = join(REPOSITORY_ROOT, 'backend/src/config/storage-config.ts');
    const script = `import { StorageConfig } from ${JSON.stringify(modulePath)}; process.stdout.write(new StorageConfig(${JSON.stringify(configured)}).root);`;
    const result = execFileSync(process.execPath, ['--import', join(REPOSITORY_ROOT, 'node_modules/tsx/dist/loader.mjs'), '--input-type=module', '-e', script], { cwd: directory, encoding: 'utf8' });
    expect(result).toBe(destination);
    expect(existsSync(join(destination, 'soundry.db'))).toBe(true);
  });

  it.each(['root', 'intermediate', 'soundry.db', 'soundry.db-wal', 'soundry.db-shm', 'soundry.db-journal', 'audio', 'temp'])('rejects a %s symlink without touching its target', (target) => {
    const outside = join(directory, 'outside'); mkdirSync(outside);
    const sentinel = join(outside, 'sentinel'); writeFileSync(sentinel, 'preserve');
    const data = join(directory, 'data');
    let configured = data;
    if (target === 'root') symlinkSync(outside, data);
    else if (target === 'intermediate') { symlinkSync(outside, join(directory, 'link')); configured = join(directory, 'link', 'nested'); }
    else {
      mkdirSync(data);
      symlinkSync(target.startsWith('soundry.db') ? sentinel : outside, join(data, target));
    }
    expect(() => new StorageConfig(configured)).toThrow('UNSAFE_STORAGE_PATH');
    expect(readFileSync(sentinel, 'utf8')).toBe('preserve');
    expect(existsSync(join(outside, 'nested'))).toBe(false);
    expect(existsSync(join(outside, 'soundry.db'))).toBe(false);
  });

  it('rejects root files, empty configuration and unsafe audio paths', () => {
    const file = join(directory, 'not-a-folder'); writeFileSync(file, 'preserve');
    expect(() => new StorageConfig(file)).toThrow('UNSAFE_STORAGE_PATH');
    expect(() => new StorageConfig('')).toThrow('INVALID_DATA_DIRECTORY');
    const storage = new StorageConfig(join(directory, 'data'));
    for (const path of ['/private/tmp/other.wav', '../audio/file.wav', 'audio/../file.wav', 'audio/%2e%2e%2ffile.wav', 'audio/unrecognized.wav']) {
      expect(() => storage.resolveAudioPath(path)).toThrow('UNSAFE_AUDIO_PATH');
    }
    expect(readFileSync(file, 'utf8')).toBe('preserve');
  });

  it('rejects a directory swapped for a symlink after startup', () => {
    const storage = new StorageConfig(join(directory, 'data'));
    const outside = join(directory, 'outside'); mkdirSync(outside);
    const filename = '00000000-0000-4000-8000-000000000001.wav';
    writeFileSync(join(outside, filename), 'preserve');
    rmSync(storage.audioDirectory, { recursive: true }); symlinkSync(outside, storage.audioDirectory);
    expect(storage.removeAudio(`audio/${filename}`)).toBe(false);
    expect(readFileSync(join(outside, filename), 'utf8')).toBe('preserve');
  });

  it('refuses unsupported SQLite schema without resetting existing data', () => {
    const storage = new StorageConfig(join(directory, 'data'));
    const foreign = new BetterSqlite3(storage.databasePath);
    foreign.exec('CREATE TABLE personal_data (value TEXT); INSERT INTO personal_data VALUES (\'preserve\'); PRAGMA user_version = 99;');
    foreign.close();
    expect(() => new DatabaseService(storage)).toThrow('UNSUPPORTED_DATABASE_SCHEMA');
    const restored = new BetterSqlite3(storage.databasePath, { readonly: true });
    expect(restored.prepare('SELECT value FROM personal_data').get()).toEqual({ value: 'preserve' });
    restored.close();
  });

  it('preserves an invalid database file instead of replacing it', () => {
    const data = join(directory, 'data'); mkdirSync(data);
    const path = join(data, 'soundry.db'); writeFileSync(path, 'This is not a database.');
    const storage = new StorageConfig(data);
    expect(() => new DatabaseService(storage)).toThrow();
    expect(readFileSync(path, 'utf8')).toBe('This is not a database.');
  });
});
