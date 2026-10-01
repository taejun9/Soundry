import { randomUUID } from 'node:crypto';
import { closeSync, ftruncateSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { request } from 'node:http';
import type { ClientRequest, IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { expect, it, vi } from 'vitest';
import { createApplication } from './app.js';
import { DatabaseService } from './database/database.service.js';
import { ProjectsService } from './projects/projects.service.js';
import { MAX_AUDIO_BYTES } from './storage/storage.service.js';
import { TracksService } from './tracks/tracks.service.js';

it('closes a stalled audio download, its FD and DB lock before shutdown completes', async () => {
  const root = mkdtempSync('/private/tmp/soundry-shutdown-');
  let app: NestExpressApplication | undefined;
  let req: ClientRequest | undefined;
  let response: IncomingMessage | undefined;
  let source: ReadStream | undefined;
  let closing: Promise<void> | undefined;
  try {
    app = await createApplication({ dataDir: root, uiPort: '5173', musicProvider: 'mock' });
    await app.listen(0, '127.0.0.1');
    const port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
    const database = app.get(DatabaseService);
    const service = app.get(TracksService);
    const project = app.get(ProjectsService).create('종료 경계 테스트');
    const generation = randomUUID(), id = randomUUID(), now = new Date().toISOString();
    database.client.prepare('INSERT INTO generations(id,project_id,prompt,settings_json,provider,status,variation_count,request_key,created_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(generation, project.id, '임시 합성 WAV', '{}', 'mock', 'completed', 1, randomUUID(), now, now);
    database.client.prepare('INSERT INTO tracks(id,generation_id,variation_index,title,audio_path,mime_type,byte_size,provider,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id, generation, 0, '임시 합성 WAV', `audio/${id}.wav`, 'audio/wav', MAX_AUDIO_BYTES, 'mock', now);
    const header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(MAX_AUDIO_BYTES - 8, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
    header.writeUInt32LE(44100, 24); header.writeUInt32LE(176400, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
    header.write('data', 36); header.writeUInt32LE(MAX_AUDIO_BYTES - 44, 40);
    const fd = openSync(join(root, 'audio', `${id}.wav`), 'wx');
    try { writeSync(fd, header); ftruncateSync(fd, MAX_AUDIO_BYTES); } finally { closeSync(fd); }
    const original = service.openAudio.bind(service);
    vi.spyOn(service, 'openAudio').mockImplementation((value) => {
      const audio = original(value);
      return { ...audio, stream(start, end) { source = audio.stream(start, end); return source; } };
    });
    await new Promise<void>((resolve, reject) => {
      req = request({ host: '127.0.0.1', port, path: `/api/tracks/${id}/audio`, headers: { host: 'localhost:3000' } }, (res) => {
        response = res; res.on('error', () => undefined);
        res.once('data', () => { res.pause(); resolve(); });
      });
      req.setTimeout(3000, () => req?.destroy(new Error('test connection timeout')));
      req.on('error', reject); req.end();
    });
    expect(source?.closed).toBe(false);
    closing = app.close();
    expect(await Promise.race([closing.then(() => true), delay(1500, false)])).toBe(true);
    for (let count = 0; count < 100 && !source?.closed; count++) await delay(5);
    expect(source?.closed).toBe(true);
    expect(source!.bytesRead).toBeLessThan(MAX_AUDIO_BYTES);
    expect(database.client.open).toBe(false);
    const reopened = await createApplication({ dataDir: root, uiPort: '5173', musicProvider: 'mock' });
    await reopened.init();
    await reopened.close();
  } finally {
    response?.destroy(); req?.destroy();
    await (closing ?? app?.close());
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  }
});
