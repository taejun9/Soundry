import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from './app.js';

type HttpResult = { status: number; body: string; headers: Record<string, string | string[] | undefined> };
let app: NestExpressApplication;
let port: number;
const uiOrigin = 'http://127.0.0.1:5173';
const temporaryRoots: string[] = [];
function testDataDir(): string {
  const root = mkdtempSync('/private/tmp/soundry-boundary-');
  temporaryRoots.push(root);
  return root;
}

function callApi(options: { port?: number; path?: string; method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const body = options.body;
    const req = request({
      hostname: '127.0.0.1',
      port: options.port ?? port,
      path: options.path ?? '/api/health',
      method: options.method ?? 'GET',
      headers: {
        host: '127.0.0.1:3000',
        ...(body !== undefined ? { 'content-length': String(Buffer.byteLength(body)) } : {}),
        ...options.headers,
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), headers: response.headers }));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });
}

beforeAll(async () => {
  app = await createApplication({ musicProvider: 'mock', uiPort: '5173', dataDir: testDataDir() });
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
});

afterAll(async () => {
  await app?.close();
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

describe('local API boundary', () => {
  it('returns only the public health contract', async () => {
    const result = await callApi();
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ status: 'ok', service: 'soundry-api' });
    expect(result.headers['x-powered-by']).toBeUndefined();
    expect(result.headers['cache-control']).toBe('no-store');
  });

  it('exposes provider capabilities without credentials or internal configuration', async () => {
    const result = await callApi({ path: '/api/providers/current' });
    expect(result.status).toBe(200);
    const summary = JSON.parse(result.body);
    expect(Object.keys(summary).sort()).toEqual(['capabilities', 'configured', 'generationEnabled', 'id', 'isMock', 'model', 'notice']);
    expect(summary).toMatchObject({ id: 'mock', isMock: true, configured: true, generationEnabled: false });
    expect(summary.capabilities).toEqual({ modes: ['instrumental'], settings: [], maxVariations: 4, seedSupported: false, canCancelRemote: false });
  });

  it('rejects a non-allowlisted Host even with an approved forwarded Host', async () => {
    const result = await callApi({ headers: { host: 'attacker.example:3000', 'x-forwarded-host': 'localhost:3000' } });
    expect(result.status).toBe(403);
    expect(JSON.parse(result.body).error.code).toBe('FORBIDDEN_HOST');
  });

  it('rejects foreign or opaque origins without granting CORS', async () => {
    for (const origin of ['https://attacker.example', 'null', 'http://localhost:9999']) {
      const result = await callApi({ headers: { origin } });
      expect(result.status).toBe(403);
      expect(result.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('allows only the configured UI origins', async () => {
    for (const origin of [uiOrigin, 'http://localhost:5173']) {
      const result = await callApi({ headers: { origin, host: 'localhost:3000' } });
      expect(result.status).toBe(200);
      expect(result.headers['access-control-allow-origin']).toBe(origin);
    }
  });

  it('uses only the explicitly configured alternate UI port', async () => {
    const alternateApp = await createApplication({ musicProvider: 'mock', uiPort: '5174', dataDir: testDataDir() });
    try {
      await alternateApp.listen(0, '127.0.0.1');
      const alternatePort = ((alternateApp.getHttpServer() as Server).address() as AddressInfo).port;
      for (const origin of ['http://localhost:5174', 'http://127.0.0.1:5174']) {
        const result = await callApi({ port: alternatePort, headers: { origin } });
        expect(result.status).toBe(200);
        expect(result.headers['access-control-allow-origin']).toBe(origin);
      }
      const oldOrigin = await callApi({ port: alternatePort, headers: { origin: uiOrigin } });
      expect(oldOrigin.status).toBe(403);
      expect(oldOrigin.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await alternateApp.close();
    }
  });

  it('rejects invalid UI configuration before creating a server', async () => {
    await expect(createApplication({ uiPort: '3000', dataDir: testDataDir() })).rejects.toThrow('INVALID_UI_PORT');
    await expect(createApplication({ uiPort: '5174/attacker', dataDir: testDataDir() })).rejects.toThrow('INVALID_UI_PORT');
  });

  it('rejects invalid provider configuration before creating storage or a server', async () => {
    const dataDir = `${testDataDir()}/not-created`;
    await expect(createApplication({ musicProvider: 'unknown-private-value', dataDir })).rejects.toThrow(/^INVALID_MUSIC_PROVIDER$/);
    expect(existsSync(dataDir)).toBe(false);
  });

  it('answers approved preflight without enabling credentials or wildcard access', async () => {
    const result = await callApi({ method: 'OPTIONS', headers: { origin: uiOrigin, 'access-control-request-method': 'POST' } });
    expect(result.status).toBe(204);
    expect(result.headers['access-control-allow-origin']).toBe(uiOrigin);
    expect(result.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('requires an approved Origin on mutation requests', async () => {
    const result = await callApi({ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(result.status).toBe(403);
    expect(JSON.parse(result.body).error.code).toBe('FORBIDDEN_ORIGIN');
  });

  it('rejects simple browser mutation requests', async () => {
    const result = await callApi({ method: 'POST', headers: { origin: uiOrigin, 'content-type': 'text/plain' }, body: '{}' });
    expect(result.status).toBe(415);
  });

  it('returns safe JSON for malformed input without reflecting contents', async () => {
    const result = await callApi({ method: 'POST', headers: { origin: uiOrigin, 'content-type': 'application/json' }, body: '{"secret-token"' });
    expect(result.status).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('INVALID_INPUT');
    expect(result.body).not.toContain('secret-token');
  });

  it('enforces the 64 KiB JSON body limit', async () => {
    const result = await callApi({ method: 'POST', headers: { origin: uiOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(65_536) }) });
    expect(result.status).toBe(413);
    expect(JSON.parse(result.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects compressed JSON bodies before decompression', async () => {
    const result = await callApi({ method: 'POST', headers: { origin: uiOrigin, 'content-type': 'application/json', 'content-encoding': 'gzip' }, body: '{}' });
    expect(result.status).toBe(415);
  });

  it('returns a safe JSON 404 without reflecting requested paths', async () => {
    const result = await callApi({ path: '/api/private-file-name' });
    expect(result.status).toBe(404);
    expect(JSON.parse(result.body).error.code).toBe('NOT_FOUND');
    expect(result.body).not.toContain('private-file-name');
  });
});
