/**
 * 실제 HTTP streaming으로 원본 bytes·Range/HEAD·다운로드 헤더와 파일 descriptor 소유권을 검증한다.
 * 자체 fixture만 임시 루트에 복사하고 링크/경로 교체/삭제/연결 종료/읽기 실패를 통해 자원과 정보 경계를 확인한다.
 */
import { randomUUID } from 'node:crypto';
import { copyFileSync, fstatSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { request } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApplication } from '../app.js';
import { REPOSITORY_ROOT } from '../config/storage-config.js';
import { DatabaseService } from '../database/database.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { TracksService } from './tracks.service.js';
import type { OpenedAudio } from './tracks.service.js';

type Result = { status: number; headers: IncomingHttpHeaders; body: Buffer };
let app: NestExpressApplication;
let database: DatabaseService;
let service: TracksService;
let root: string;
let port: number;
let id: string;
let path: string;
let bytes: Buffer;
let projectId: string;

// 응답을 Buffer로 수집해 문자열 변환 없이 원본 byte 위치와 길이를 비교한다.
function call(method = 'GET', endpoint = 'audio', headers: Record<string, string> = {}, trackId = id): Promise<Result> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, method, path: `/api/tracks/${trackId}/${endpoint}`, headers: { host: 'localhost:3000', ...headers } }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
      response.on('aborted', () => reject(new Error('HTTP response aborted')));
    });
    req.setTimeout(3000, () => req.destroy(new Error('HTTP test timeout')));
    req.on('error', reject);
    req.end();
  });
}
// stream close는 비동기일 수 있으므로 제한된 polling으로 실제 FD 반납 완료를 확인한다.
async function untilClosed(source: ReadStream): Promise<void> {
  for (let count = 0; count < 100 && !source.closed; count++) await delay(5);
  expect(source.closed).toBe(true);
}
// 실제 openAudio를 유지하면서 stream/close만 관측한다. 경로 검증을 대역으로 건너뛰지 않는다.
function captureAudio(transform?: (audio: OpenedAudio) => OpenedAudio) {
  const original = service.openAudio.bind(service);
  const opened: { close: ReturnType<typeof vi.fn<OpenedAudio['close']>>; streams: ReadStream[] }[] = [];
  vi.spyOn(service, 'openAudio').mockImplementation((value) => {
    const audio = original(value);
    const entry = { close: vi.fn(() => audio.close()), streams: [] as ReadStream[] };
    opened.push(entry);
    const wrapped: OpenedAudio = { ...audio, close: entry.close, stream(start, end) { const stream = audio.stream(start, end); entry.streams.push(stream); return stream; } };
    return transform?.(wrapped) ?? wrapped;
  });
  return opened;
}

// 각 사례마다 실제 DB row와 작은 WAV 파일을 준비해 metadata와 파일 간 불일치를 독립적으로 조작할 수 있게 한다.
beforeEach(async () => {
  root = mkdtempSync('/private/tmp/soundry-track-api-');
  app = await createApplication({ dataDir: root, uiPort: '5173', musicProvider: 'mock' });
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
  database = app.get(DatabaseService);
  service = app.get(TracksService);
  projectId = app.get(ProjectsService).create('원본 스트림 테스트').id;
  const generationId = randomUUID();
  const now = new Date().toISOString();
  database.client.prepare('INSERT INTO generations (id, project_id, prompt, settings_json, provider, status, variation_count, request_key, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(generationId, projectId, '자체 합성 fixture', '{}', 'mock', 'completed', 1, randomUUID(), now, now);
  id = randomUUID();
  path = join(root, 'audio', `${id}.wav`);
  const fixture = join(REPOSITORY_ROOT, 'backend', 'fixtures', 'audio', 'demo-01.wav');
  copyFileSync(fixture, path);
  bytes = readFileSync(fixture);
  database.client.prepare('INSERT INTO tracks (id, generation_id, variation_index, title, audio_path, mime_type, byte_size, duration_seconds, provider, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, generationId, 0, '새벽의 정원 🎵', `audio/${id}.wav`, 'audio/wav', bytes.length, 8, 'mock', 'demo-fixture', now);
});
afterEach(async () => { vi.restoreAllMocks(); await app?.close(); rmSync(root, { recursive: true, force: true }); });

// 재생과 다운로드가 같은 원본을 제공하고 read 요청은 프로젝트 수정 시각을 바꾸지 않는지 확인한다.
describe('original track HTTP streaming', () => {
  it('streams exact original bytes for inline audio and an attachment without touching project timestamps', async () => {
    const timestamp = app.get(ProjectsService).get(projectId).updatedAt;
    for (const endpoint of ['audio', 'download']) {
      const response = await call('GET', endpoint);
      expect(response.status).toBe(200);
      expect(response.body.equals(bytes)).toBe(true);
      expect(response.headers['content-type']).toBe('audio/wav');
      expect(response.headers['content-length']).toBe(String(bytes.length));
      expect(response.headers['accept-ranges']).toBe('bytes');
      expect(response.headers['content-range']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['content-disposition']).toMatch(new RegExp(`^${endpoint === 'audio' ? 'inline' : 'attachment'};`));
      expect(decodeURIComponent(response.headers['content-disposition']!.split("UTF-8''")[1]!)).toBe('새벽의 정원 🎵.wav');
    }
    expect(app.get(ProjectsService).get(projectId).updatedAt).toBe(timestamp);
  });

  it('serves a bounded single range, open-ended range and suffix with original byte positions', async () => {
    for (const [range, start, end] of [ ['bytes=0-0', 0, 0], ['bytes=10-100', 10, 100], [`bytes=${bytes.length - 10}-`, bytes.length - 10, bytes.length - 1], ['bytes=-15', bytes.length - 15, bytes.length - 1], ['bytes=5-999999999999999999999', 5, bytes.length - 1], ['bytes=-999999999999999999', 0, bytes.length - 1] ] as const) {
      const response = await call('GET', 'audio', { range });
      expect(response.status).toBe(206);
      expect(response.headers['content-range']).toBe(`bytes ${start}-${end}/${bytes.length}`);
      expect(response.headers['content-length']).toBe(String(end - start + 1));
      expect(response.body.equals(bytes.subarray(start, end + 1))).toBe(true);
    }
    expect((await call('GET', 'download', { range: 'bytes=0-43' })).body.equals(bytes.subarray(0, 44))).toBe(true);
  });

  it('returns safe 416 for valid outside ranges and closes each opened resource', async () => {
    const opened = captureAudio();
    for (const range of [`bytes=${bytes.length}-`, 'bytes=-0', 'bytes=999999999999999999999999-']) {
      const response = await call('GET', 'audio', { range });
      expect(response.status).toBe(416);
      expect(response.headers['content-range']).toBe(`bytes */${bytes.length}`);
      expect(JSON.parse(response.body.toString()).error.code).toBe('RANGE_NOT_SATISFIABLE');
      expect(response.body.toString()).not.toContain(root);
    }
    for (const resource of opened) { expect(resource.close).toHaveBeenCalledOnce(); expect(resource.streams).toHaveLength(0); }
  });

  it('ignores malformed, multiple and conditional ranges with full 200', async () => {
    for (const headers of [{ range: 'bytes=10-9' }, { range: 'bytes=0-1,10-20' }, { range: 'other=0-1' }, { range: 'bytes=-' }, { range: 'bytes=0-1', 'if-range': '"unknown-validator"' }, { range: 'bytes=0-1', 'if-range': 'Wed, 01 Jan 2020 00:00:00 GMT' }] as Record<string, string>[]) {
      const response = await call('GET', 'audio', headers);
      expect(response.status).toBe(200);
      expect(response.headers['content-range']).toBeUndefined();
      expect(response.body.equals(bytes)).toBe(true);
    }
  });

  it('HEAD ignores every Range and returns full GET metadata with no body or stream', async () => {
    const opened = captureAudio();
    for (const endpoint of ['audio', 'download']) {
      for (const range of ['bytes=0-0', `bytes=${bytes.length}-`, 'bytes=0-1,3-4']) {
        const response = await call('HEAD', endpoint, { range });
        expect(response.status).toBe(200);
        expect(response.body.length).toBe(0);
        expect(response.headers['content-length']).toBe(String(bytes.length));
        expect(response.headers['content-type']).toBe('audio/wav');
        expect(response.headers['content-range']).toBeUndefined();
        expect(response.headers['accept-ranges']).toBe('bytes');
      }
    }
    for (const resource of opened) { expect(resource.close).toHaveBeenCalledOnce(); expect(resource.streams).toHaveLength(0); }
  });

  it('distinguishes invalid IDs, absent tracks and missing original files without reflecting paths', async () => {
    for (const trackId of ['bad-id', '..%2Fprivate']) expect((await call('GET', 'audio', {}, trackId)).status).toBe(400);
    expect((await call('GET', 'audio', {}, randomUUID())).status).toBe(404);
    unlinkSync(path);
    const missing = await call();
    expect(missing.status).toBe(404);
    expect(JSON.parse(missing.body.toString()).error.code).toBe('AUDIO_MISSING');
    expect(missing.body.toString()).not.toContain(root);
    expect((await call('HEAD')).body.length).toBe(0);
  });

  it('uses safe verified-extension attachment names even for hostile stored titles', async () => {
    database.client.prepare('UPDATE tracks SET title=? WHERE id=?').run('../escape\\private\r\nInjected: yes\0\ud800.mp3', id);
    const response = await call('GET', 'download');
    expect(response.status).toBe(200);
    const filename = decodeURIComponent(response.headers['content-disposition']!.split("UTF-8''")[1]!);
    expect(filename).not.toMatch(/[/\\\r\n\0:]/);
    expect(filename.endsWith('.wav')).toBe(true);
    expect(response.headers.injected).toBeUndefined();
  });
});

// 검증한 파일만 읽고 한 번 소유한 FD를 반드시 닫아야 한다. 안전성 실패 메시지에는 실제 경로를 노출하지 않는다.
describe('audio path and FD ownership boundaries', () => {
  it('refuses stored traversal, absolute paths and a different media type/size', async () => {
    for (const unsafe of ['../outside.wav', '/private/outside.wav', `audio/../${id}.wav`, `audio/%2e%2e%2f${id}.wav`]) {
      database.client.prepare('UPDATE tracks SET audio_path=? WHERE id=?').run(unsafe, id);
      const response = await call();
      expect(response.status).toBe(409);
      expect(response.body.toString()).not.toContain('outside');
    }
    database.client.prepare('UPDATE tracks SET audio_path=?, mime_type=? WHERE id=?').run(`audio/${id}.wav`, 'text/html', id);
    expect((await call()).status).toBe(409);
    database.client.prepare('UPDATE tracks SET mime_type=?, byte_size=? WHERE id=?').run('audio/wav', bytes.length + 1, id);
    expect((await call()).status).toBe(409);
  });

  it('refuses a final symlink, hardlink, directory or a symlinked audio directory', async () => {
    const outside = join(root, 'outside.wav');
    copyFileSync(path, outside);
    unlinkSync(path);
    symlinkSync(outside, path);
    expect((await call()).status).toBe(409);
    unlinkSync(path);
    linkSync(outside, path);
    expect((await call()).status).toBe(409);
    unlinkSync(path);
    mkdirSync(path);
    expect((await call()).status).toBe(409);
    rmSync(path, { recursive: true });
    copyFileSync(outside, path);
    renameSync(join(root, 'audio'), join(root, 'original-audio'));
    symlinkSync(join(root, 'original-audio'), join(root, 'audio'));
    expect((await call()).status).toBe(409);
    expect(readFileSync(outside).equals(bytes)).toBe(true);
  });

  it('refuses files with changed WAV signature or RIFF length', async () => {
    const wrongSignature = Buffer.from(bytes); wrongSignature.write('HTML', 0); writeFileSync(path, wrongSignature);
    expect((await call()).status).toBe(409);
    const wrongSize = Buffer.from(bytes); wrongSize.writeUInt32LE(40, 4); writeFileSync(path, wrongSize);
    expect((await call()).status).toBe(409);
  });

  // open 뒤 pathname을 바꾸어도 검증된 기존 FD의 원본을 읽어야 한다. stream 생성 시 경로를 다시 여는 회귀를 잡는다.
  it('streams the checked inode if the pathname is replaced after open', async () => {
    const replacement = Buffer.from(bytes); replacement.fill(0x11, 44);
    const opened = captureAudio((audio) => {
      renameSync(path, `${path}.original`);
      writeFileSync(path, replacement);
      return audio;
    });
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.body.equals(bytes)).toBe(true);
    expect(response.body.equals(replacement)).toBe(false);
    await untilClosed(opened[0]!.streams[0]!);
  });

  it('keeps an already-open original stream readable when the path is deleted', async () => {
    const opened = captureAudio((audio) => { unlinkSync(path); return audio; });
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.body.equals(bytes)).toBe(true);
    await untilClosed(opened[0]!.streams[0]!);
  });

  // client가 끝까지 읽지 않아도 pipeline이 source를 파기해 FD를 남기지 않아야 한다.
  it('closes the streamed FD when the client disconnects before the whole response', async () => {
    const opened = captureAudio();
    await new Promise<void>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path: `/api/tracks/${id}/audio`, headers: { host: 'localhost:3000' } }, (response) => {
        response.once('data', () => { response.destroy(); req.destroy(); resolve(); });
        response.on('error', () => undefined);
      });
      req.on('error', reject); req.end();
    });
    const source = opened[0]!.streams[0]!;
    const fd = (source as unknown as { fd?: number }).fd;
    await untilClosed(source);
    expect(source.destroyed).toBe(true);
    if (typeof fd === 'number') expect(() => fstatSync(fd)).toThrow();
  });

  // headers 전송 뒤 I/O 실패를 JSON으로 이어 붙이면 오디오 손상/정보 노출이 생기므로 연결 종료를 확인한다.
  it('closes the FD on a stream I/O error and keeps raw diagnostics off the response', async () => {
    const opened = captureAudio((audio) => ({ ...audio, stream(start, end) {
      const source = audio.stream(start, end);
      queueMicrotask(() => source.destroy(new Error('/private/diagnostic secret-test-token')));
      return source;
    } }));
    await expect(call()).rejects.toThrow();
    await untilClosed(opened[0]!.streams[0]!);
    vi.restoreAllMocks();
    expect((await call('HEAD')).status).toBe(200);
  });
});
