import { createServer, request as httpRequest, type Server, type IncomingHttpHeaders } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { readLanHost } from '../../shared/lan-config.js';

const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };
/** Serves only the production UI; proxy target is fixed loopback. No Vite source tree on LAN. */
export function createLanGateway(host: string, port: number, dist: string): Server {
  if (!readLanHost(host) || !Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000) throw new Error('INVALID_LAN_CONFIG');
  const authority = `${host}:${port}`;
  const origin = `http://${authority}`;
  const root = resolve(dist);
  const canonicalRoot = realpath(root).catch(() => undefined);
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.headers.host !== authority || req.headers.origin !== undefined && req.headers.origin !== origin) {
      res.writeHead(403).end('Forbidden'); return;
    }
    if (req.url?.startsWith('/api/') || req.url === '/api') {
      // Remove hop-by-hop and caller-provided forwarding/Host headers. Cookies remain unchanged.
      const headers: IncomingHttpHeaders = { ...req.headers, host: '127.0.0.1:3000' };
      for (const key of Object.keys(headers)) if (['connection', 'upgrade', 'proxy-authorization', 'proxy-connection', 'transfer-encoding'].includes(key) || key.startsWith('x-forwarded-')) delete headers[key];
      const upstream = httpRequest({ host: '127.0.0.1', port: 3000, method: req.method, path: req.url, headers, timeout: 120_000 }, (reply) => {
        res.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.on('error', () => res.destroy());
        reply.pipe(res);
      });
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502).end('Soundry API unavailable'); else res.destroy(); });
      req.on('aborted', () => upstream.destroy());
      res.on('close', () => upstream.destroy());
      req.pipe(upstream); return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    try {
      const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]!);
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some((s) => s === '..' || s.startsWith('.'))) { res.writeHead(404).end(); return; }
      let candidate = resolve(root, '.' + pathname);
      if (!candidate.startsWith(root + sep) && candidate !== root) { res.writeHead(404).end(); return; }
      if (!extname(pathname)) candidate = resolve(root, 'index.html');
      const actual = await realpath(candidate);
      const canonical = await canonicalRoot;
      if (!canonical || !actual.startsWith(canonical + sep) || !(await stat(actual)).isFile()) { res.writeHead(404).end(); return; }
      const info = await stat(actual);
      res.writeHead(200, { 'Content-Type': mime[extname(actual)] ?? 'application/octet-stream', 'Content-Length': info.size });
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = createReadStream(actual);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch { if (!res.headersSent) res.writeHead(404).end(); else res.destroy(); }
  });
}
