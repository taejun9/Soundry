import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import express from 'express';
import { readLanHost } from '../../shared/lan-config.js';
import { createLocalBoundary } from '../../backend/src/config/local-boundary.js';
import { createLanGateway } from './lan-server.js';

async function rawFetch(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; headers: { get: (key: string) => string | null }; text: () => Promise<string> }>((resolve, reject) => {
    const req = request(url, options, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, headers: { get: key => String(res.headers[key] ?? '') || null }, text: async () => body }));
      res.on('error', reject);
    });
    req.on('error', reject); req.end(options.body);
  });
}

describe('explicit trusted LAN' , () => {
  it.each(['10.1.2.3', '172.20.1.9', '172.16.0.2', '172.31.0.2', '192.168.1.10'])('accepts private IPv4 %s', host => expect(readLanHost(host)).toBe(host));
  it.each(['', '0.0.0.0', '127.0.0.1', '8.8.8.8', '172.15.1.2', '172.32.1.2', '192.169.1.2', '192.168.1.0', '192.168.1.255', '192.168.01.2', '192.168.1.999', 'http://192.168.1.2', '192.168.1.2:5174', '::1'])('rejects invalid LAN host %s', host => expect(() => readLanHost(host)).toThrow('INVALID_LAN_HOST'));
  it('keeps loopback as the absent default', () => expect(readLanHost(undefined)).toBeUndefined());
  it('allows only the explicit LAN UI origin without changing API Host policy', async () => {
    const app = express(); app.use(createLocalBoundary(5174, '172.20.1.9')); app.use((_req, res) => { res.status(200).end('ok'); });
    const server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('TEST_ADDRESS');
    const base = `http://127.0.0.1:${address.port}`;
    const call = (origin: string, host = '127.0.0.1:3000') => rawFetch(base, { method: 'POST', headers: { host, origin, 'content-type': 'application/json' }, body: '{}' });
    try {
      expect((await call('http://172.20.1.9:5174')).status).toBe(200);
      expect((await call('http://172.20.1.8:5174')).status).toBe(403);
      expect((await call('http://172.20.1.9:5173')).status).toBe(403);
      expect((await call('http://172.20.1.9:5174', '172.20.1.9:3000')).status).toBe(403);
      expect((await rawFetch(base, { method: 'POST', headers: { host: '127.0.0.1:3000', 'content-type': 'application/json' }, body: '{}' })).status).toBe(403);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it('serves only compiled UI files and rejects other hosts, origins and escaping paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'soundry-lan-')); const dist = join(root, 'dist'); await mkdir(dist);
    await writeFile(join(dist, 'index.html'), '<p>Soundry</p>'); await writeFile(join(dist, 'app.js'), 'console.log("ui")');
    await writeFile(join(root, 'private.txt'), 'private'); await symlink(join(root, 'private.txt'), join(dist, 'escape.txt'));
    const server = createLanGateway('172.20.1.9', 5174, dist); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('TEST_ADDRESS');
    const base = `http://127.0.0.1:${address.port}`; const headers = { host: '172.20.1.9:5174' };
    try {
      expect(await (await rawFetch(base + '/projects', { headers })).text()).toBe('<p>Soundry</p>');
      expect((await rawFetch(base + '/app.js', { headers })).headers.get('content-type')).toContain('javascript');
      expect((await rawFetch(base + '/app.js', { method: 'HEAD', headers })).headers.get('content-length')).toBe('17');
      for (const path of ['/.env', '/%2e%2e%2fprivate.txt', '/escape.txt', '/missing.js']) expect((await rawFetch(base + path, { headers })).status).toBe(404);
      expect((await rawFetch(base, { headers: { host: 'attacker.example:5174' } })).status).toBe(403);
      expect((await rawFetch(base, { headers: { ...headers, origin: 'https://attacker.example' } })).status).toBe(403);
      expect((await rawFetch(base, { headers, method: 'POST' })).status).toBe(405);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
  });
});
