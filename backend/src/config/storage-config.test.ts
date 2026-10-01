/**
 * 저장 경로 검증이 사용자 파일을 보존하는지 실제 임시 파일시스템에서 확인한다.
 * 실행 cwd 차이, 상위/하위 symlink, 시작 후 경로 교체, 다른 schema/손상 DB를 거부하는 경계를 다룬다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../database/database.service.js';
import { REPOSITORY_ROOT, StorageConfig } from './storage-config.js';

let directory: string;
// 테스트별 전용 루트만 만들고 종료 후 제거한다. 실제 앱 data 디렉터리는 열지 않는다.
beforeEach(() => { directory = mkdtempSync('/private/tmp/soundry-storage-'); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

describe('StorageConfig path boundary', () => {
  // 별도 Node 프로세스에서 cwd를 바꾸어 모듈 cache나 현재 테스트 실행 위치에 의존하지 않는지 확인한다.
  it('resolves relative data directories from the repository even with another cwd', () => {
    const destination = join(directory, 'data');
    const configured = relative(REPOSITORY_ROOT, destination);
    const modulePath = join(REPOSITORY_ROOT, 'backend/src/config/storage-config.ts');
    const script = `import { StorageConfig } from ${JSON.stringify(modulePath)}; process.stdout.write(new StorageConfig(${JSON.stringify(configured)}).root);`;
    const result = execFileSync(process.execPath, ['--import', join(REPOSITORY_ROOT, 'node_modules/tsx/dist/loader.mjs'), '--input-type=module', '-e', script], { cwd: directory, encoding: 'utf8' });
    expect(result).toBe(destination);
    expect(existsSync(join(destination, 'soundry.db'))).toBe(true);
  });

  // 보호할 sentinel을 링크 대상에 두고 거부 후에도 내용과 디렉터리 구조가 그대로인지 검사한다.
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

  // 시작 시 검사만으로 충분하지 않다. 이후 삭제 시에도 교체된 링크를 따라가지 않아야 한다.
  it('rejects a directory swapped for a symlink after startup', () => {
    const storage = new StorageConfig(join(directory, 'data'));
    const outside = join(directory, 'outside'); mkdirSync(outside);
    const filename = '00000000-0000-4000-8000-000000000001.wav';
    writeFileSync(join(outside, filename), 'preserve');
    rmSync(storage.audioDirectory, { recursive: true }); symlinkSync(outside, storage.audioDirectory);
    expect(storage.removeAudio(`audio/${filename}`)).toBe(false);
    expect(readFileSync(join(outside, filename), 'utf8')).toBe('preserve');
  });

  // 미래 schema 또는 다른 앱 DB가 보이면 reset하지 않고 실패해야 하므로 기존 row를 다시 열어 검증한다.
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
