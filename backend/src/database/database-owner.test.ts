/**
 * 한 저장 루트의 DB 복구/파일 정리는 서버 한 개만 수행해야 한다는 계약을 검증한다.
 * 실제 자식 프로세스와 SQLite 잠금을 사용하고, 정리 대상 밖의 파일·링크는 sentinel로 보존 여부를 확인한다.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
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

// 모듈 import 준비와 실제 DB 잠금 시도를 별도 단계로 기다린다. 전체 프로세스 시작 시간을 잠금 응답 시간으로 오인하지 않는다.
function childMessage(child: ChildProcess, type: 'ready' | 'result', timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); child.off('message', message); child.off('error', failed); child.off('exit', exited); };
    const message = (value: unknown) => {
      if (typeof value === 'object' && value !== null && 'type' in value && value.type === type) { cleanup(); resolve(value); }
    };
    const failed = (error: Error) => { cleanup(); reject(error); };
    const exited = () => failed(new Error(`Database probe exited before ${type}`));
    const timer = setTimeout(() => failed(new Error(`Database probe did not report ${type} within ${timeoutMs}ms`)), timeoutMs);
    child.on('message', message); child.once('error', failed); child.once('exit', exited);
  });
}

describe('single data-root owner and restart cleanup', () => {
  // 진행 중처럼 보이는 temp/audio를 첫 연결 뒤에 만든다. 두 번째 연결이 잠금 전에 정리한다면 이 bytes가 사라져 테스트가 실패한다.
  it('blocks another process before cleanup and releases ownership on shutdown', async () => {
    const storage = new StorageConfig(root);
    owner = new DatabaseService(storage);
    const id = randomUUID(); const audio = join(storage.audioDirectory, `${id}.wav`); writeFileSync(audio, 'in-flight bytes');
    const directory = join(storage.tempDirectory, randomUUID()); mkdirSync(directory); const part = join(directory, `${randomUUID()}.part`); writeFileSync(part, 'in-flight bytes');
    const script = `
      import 'reflect-metadata';
      import { StorageConfig } from ${JSON.stringify(join(REPOSITORY_ROOT, 'backend/src/config/storage-config.ts'))};
      import { DatabaseService } from ${JSON.stringify(join(REPOSITORY_ROOT, 'backend/src/database/database.service.ts'))};
      process.once('message', () => {
        let status;
        try { const db = new DatabaseService(new StorageConfig(${JSON.stringify(root)})); db.onApplicationShutdown(); status = 'opened'; }
        catch(error) { status = error.message; }
        process.send({ type: 'result', status }, () => process.disconnect());
      });
      process.send({ type: 'ready' });
    `;
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      cwd: join(REPOSITORY_ROOT, 'backend'), stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
    try {
      // tsx/Nest import는 suite 병렬 부하의 영향을 받지만, 준비 이후 SQLite의 1초 busy 한도는 그대로 확인한다.
      await childMessage(child, 'ready', 10_000);
      const result = childMessage(child, 'result', 3_000);
      child.send('probe');
      expect(await result).toEqual({ type: 'result', status: 'DATA_DIRECTORY_IN_USE' });
    } finally {
      // 실패 시에도 이 테스트가 만든 child만 종료하고 close를 기다린 뒤 임시 DB를 정리한다.
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await closed;
    }
    expect(readFileSync(audio, 'utf8')).toBe('in-flight bytes');
    expect(readFileSync(part, 'utf8')).toBe('in-flight bytes');
    expect(owner.client.prepare('SELECT count(*) AS count FROM projects').get()).toEqual({ count: 0 });
    owner.onApplicationShutdown(); owner = new DatabaseService(storage);
    expect(existsSync(audio)).toBe(false);
    expect(readdirSync(storage.tempDirectory)).toEqual([]);
  });

  // UUID .part는 지우되 임의 이름·symlink·hardlink는 보존하고 정리 보류 경고를 남겨야 한다.
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
