import type { RequestHandler } from 'express';

export const API_HOST = '127.0.0.1';
export const API_PORT = 3000;

const allowedHosts = new Set(['127.0.0.1:3000', 'localhost:3000']);
const readMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function readUiPort(value: string | undefined): number {
  if (value === undefined) return 5173;
  const port = Number(value);
  if (!/^[0-9]+$/.test(value) || !Number.isInteger(port) || port < 1024 || port > 65535 || port === API_PORT) {
    throw new Error('INVALID_UI_PORT');
  }
  return port;
}

export function createLocalBoundary(uiPort: number): RequestHandler {
  const allowedOrigins = new Set([`http://127.0.0.1:${uiPort}`, `http://localhost:${uiPort}`]);
  return (request, response, next): void => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');

    if (!allowedHosts.has(request.headers.host?.toLowerCase() ?? '')) {
      response.status(403).json({ error: { code: 'FORBIDDEN_HOST', message: '허용되지 않은 로컬 주소입니다.' } });
      return;
    }

    const origin = request.headers.origin;
    if (origin !== undefined && !allowedOrigins.has(origin)) {
      response.status(403).json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Soundry 화면에서 요청해 주세요.' } });
      return;
    }

    if (origin !== undefined) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.vary('Origin');
    }

    if (request.method === 'OPTIONS') {
      if (origin === undefined) {
        response.status(403).json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Soundry 화면에서 요청해 주세요.' } });
        return;
      }
      response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PATCH, DELETE, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Soundry-Request');
      response.status(204).end();
      return;
    }

    if (!readMethods.has(request.method)) {
      if (origin === undefined) {
        response.status(403).json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Soundry 화면에서 요청해 주세요.' } });
        return;
      }
      const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
      if (contentType !== 'application/json' && request.headers['x-soundry-request'] !== '1') {
        response.status(415).json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'JSON 요청을 사용해 주세요.' } });
        return;
      }
    }

    next();
  };
}
