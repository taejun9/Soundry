/**
 * 실제 파일 저장으로 batch 원자성·크기 상한·취소 및 소유 파일 보호를 검증한다.
 * 대역 stream이 중간에 경로를 바꾸거나 멈추는 상황을 만들어도 외부 sentinel을 지우거나 부분 결과를 공개하면 안 된다.
 */
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPOSITORY_ROOT, StorageConfig } from '../config/storage-config.js';
import type { ProviderTrack } from '../providers/music-generation-provider.js';
import { MAX_AUDIO_BYTES, StorageService } from './storage.service.js';

let root: string;
let config: StorageConfig;
let storage: StorageService;
const fixture = join(REPOSITORY_ROOT, 'backend/fixtures/audio/demo-01.wav');
// duration=999라는 잘못된 provider 주장을 넣어 실제 WAV 측정 길이 8초가 우선하는지 확인한다.
function source(audio: AsyncIterable<Uint8Array> = createReadStream(fixture)): ProviderTrack {
  return { audio, mediaType: 'audio/wav', extension: 'wav', model: 'demo-fixture', metadata: { durationSeconds: 999 } };
}
async function* bytes(value: Uint8Array): AsyncIterable<Uint8Array> { yield value; }
const signal = () => new AbortController().signal;
beforeEach(() => { root = mkdtempSync('/private/tmp/soundry-save-'); config = new StorageConfig(root); storage = new StorageService(config); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

// 실패/취소는 최종 audio뿐 아니라 temp 찌꺼기도 남기지 않아야 하므로 양쪽 디렉터리를 확인한다.
function expectEmpty() {
  expect(readdirSync(config.audioDirectory)).toEqual([]);
  expect(readdirSync(config.tempDirectory)).toEqual([]);
}

describe('bounded atomic batch storage', () => {
  it('stores real bytes under UUIDs and measures duration independently of provider claims', async () => {
    const result = await storage.saveBatch(randomUUID(), [source(), source()], signal());
    expect(result).toHaveLength(2);
    expect(result[0]!.id).not.toBe(result[1]!.id);
    for (const item of result) {
      expect(item.durationSeconds).toBe(8);
      expect(item.metadata.durationSeconds).toBe(8);
      expect(item.byteSize).toBe(1411244);
      expect(readFileSync(config.resolveAudioPath(item.audioPath)).equals(readFileSync(fixture))).toBe(true);
    }
    expect(readdirSync(config.tempDirectory)).toEqual([]);
    expect(storage.discardBatch(result)).toBe(false);
    expectEmpty();
  });

  // 첫 variation이 정상이더라도 뒤 결과가 손상되면 이번 batch 전체를 취소하고 기존 음원은 보존해야 한다.
  it('publishes no partial batch if a later variation is invalid and preserves other audio', async () => {
    const sentinel = join(config.audioDirectory, `${randomUUID()}.wav`);
    writeFileSync(sentinel, 'existing audio');
    await expect(storage.saveBatch(randomUUID(), [source(), source(bytes(Buffer.from('not WAV')))], signal())).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
    expect(readdirSync(config.audioDirectory)).toHaveLength(1);
    expect(readFileSync(sentinel, 'utf8')).toBe('existing audio');
    expect(readdirSync(config.tempDirectory)).toEqual([]);
  });

  it('refuses formats the selected WAV storage path does not verify', async () => {
    const audio: ProviderTrack = { ...source(bytes(Buffer.from('ID3'))), mediaType: 'audio/mpeg', extension: 'mp3' };
    await expect(storage.saveBatch(randomUUID(), [audio], signal())).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
    expectEmpty();
  });

  it('rejects oversized bytes before writing the offending chunk', async () => {
    const huge = new Uint8Array(MAX_AUDIO_BYTES + 1);
    await expect(storage.saveBatch(randomUUID(), [source(bytes(huge))], signal())).rejects.toMatchObject({ code: 'AUDIO_TOO_LARGE' });
    expectEmpty();
  });

  // iterator.next를 미완료 상태로 고정한 뒤 취소한다. 늦게 반환한 byte가 파일로 공개되면 안 된다.
  it('aborts an unresponsive iterator and discards its late result', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => { started = resolve; });
    let release!: (value: IteratorResult<Uint8Array>) => void;
    const pending = new Promise<IteratorResult<Uint8Array>>((resolve) => { release = resolve; });
    const audio: AsyncIterable<Uint8Array> = { [Symbol.asyncIterator]: () => ({ next: () => { started(); return pending; } }) };
    const result = storage.saveBatch(randomUUID(), [source(audio)], controller.signal);
    await waiting;
    controller.abort(new Error('private source reason'));
    await expect(result).rejects.toMatchObject({ name: 'AbortError', message: '음악 저장이 취소되었습니다.' });
    release({ done: false, value: readFileSync(fixture) });
    await Promise.resolve();
    expectEmpty();
  });

  it('rejects endless empty chunks without starving timeout timers', async () => {
    const audio = { async *[Symbol.asyncIterator]() { for (;;) yield new Uint8Array(); } };
    await expect(storage.saveBatch(randomUUID(), [source(audio)], signal())).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
    expectEmpty();
  });

  it('rejects cancellation before creating files and path traversal', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(storage.saveBatch(randomUUID(), [source(bytes(new Uint8Array()))], controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(storage.saveBatch('../outside', [source(bytes(new Uint8Array()))], signal())).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
    expectEmpty();
  });

  it('rejects a directory swap before publishing, preserving the outside target', async () => {
    const outside = join(root, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'sentinel'), 'preserve');
    const audio = { async *[Symbol.asyncIterator]() {
      rmSync(config.audioDirectory, { recursive: true }); symlinkSync(outside, config.audioDirectory);
      yield readFileSync(fixture);
    } };
    await expect(storage.saveBatch(randomUUID(), [source(audio)], signal())).rejects.toMatchObject({ code: 'STORAGE_FAILED' });
    expect(readdirSync(outside)).toEqual(['sentinel']);
    expect(readFileSync(join(outside, 'sentinel'), 'utf8')).toBe('preserve');
    expect(readdirSync(config.tempDirectory)).toEqual([]);
  });

  // 같은 경로 교체를 source 오류/취소/정상 종료 세 경로에 적용해 finally 정리도 링크를 따라가지 않는지 확인한다.
  it.each(['throw', 'abort', 'finish'] as const)('preserves outside files when an owned temp folder becomes a symlink: %s', async (ending) => {
    const id = randomUUID();
    const directory = join(config.tempDirectory, id);
    const parked = join(root, 'parked');
    const outside = join(root, 'outside'); mkdirSync(outside);
    const controller = new AbortController();
    let outsideFile = '';
    const audio = { async *[Symbol.asyncIterator]() {
      const filename = readdirSync(directory)[0]!;
      renameSync(directory, parked);
      outsideFile = join(outside, filename);
      writeFileSync(outsideFile, 'external file to preserve');
      symlinkSync(outside, directory);
      if (ending === 'throw') throw new Error('source failed');
      if (ending === 'abort') controller.abort();
      yield readFileSync(fixture);
    } };
    await expect(storage.saveBatch(id, [source(audio)], controller.signal)).rejects.toMatchObject(
      ending === 'abort' ? { name: 'AbortError' } : { code: 'STORAGE_FAILED' },
    );
    expect(readFileSync(outsideFile, 'utf8')).toBe('external file to preserve');
    expect(readdirSync(outside)).toHaveLength(1);
    expect(readdirSync(config.audioDirectory)).toEqual([]);
  });

  // 같은 경로의 일반 파일 교체도 위험하므로 symlink 검사만으로 부족하다. inode 소유권 검사를 직접 검증한다.
  it('does not delete or publish a replacement regular part at the same path', async () => {
    const id = randomUUID(); const directory = join(config.tempDirectory, id);
    let replacement = '';
    const audio = { async *[Symbol.asyncIterator]() {
      replacement = join(directory, readdirSync(directory)[0]!);
      renameSync(replacement, join(root, 'original-part'));
      writeFileSync(replacement, readFileSync(fixture));
      yield readFileSync(fixture);
    } };
    await expect(storage.saveBatch(id, [source(audio)], signal())).rejects.toMatchObject({ code: 'STORAGE_FAILED' });
    expect(readFileSync(replacement).equals(readFileSync(fixture))).toBe(true);
    expect(readdirSync(config.audioDirectory)).toEqual([]);
  });

  // mkdir 실패 때도 이미 있던 디렉터리는 이번 호출의 소유물이 아니므로 삭제해서는 안 된다.
  it('does not remove a pre-existing generation folder it did not create', async () => {
    const id = randomUUID(); const directory = join(config.tempDirectory, id); mkdirSync(directory);
    writeFileSync(join(directory, 'sentinel'), 'preserve');
    await expect(storage.saveBatch(id, [source(bytes(new Uint8Array()))], signal())).rejects.toMatchObject({ code: 'STORAGE_FAILED' });
    expect(existsSync(join(directory, 'sentinel'))).toBe(true);
  });
});
