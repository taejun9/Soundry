/**
 * 한 사용자용 loopback HTTP 접근 정책이다. Host는 API 주소, Origin은 명시한 UI 포트 하나에 한정한다.
 * 인증 계정을 추가하는 대신 다른 웹사이트가 브라우저를 통해 로컬 데이터를 변경하는 요청을 차단한다.
 */
import type { RequestHandler } from 'express';

export const API_HOST = '127.0.0.1';
export const API_PORT = 3000;

const allowedHosts = new Set(['127.0.0.1:3000', 'localhost:3000']);
const readMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

// UI 포트는 정수 문자열만 받으며 API 포트와의 충돌을 서버 시작 전에 거부한다.
export function readUiPort(value: string | undefined): number {
  if (value === undefined) return 5173;
  const port = Number(value);
  if (!/^[0-9]+$/.test(value) || !Number.isInteger(port) || port < 1024 || port > 65535 || port === API_PORT) {
    throw new Error('INVALID_UI_PORT');
  }
  return port;
}

// Host는 프록시 헤더 대신 실제 Host를 검증한다. 허용 Origin만 응답에 반영하며 wildcard/credentials를 열지 않는다.
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

    // preflight에도 Origin을 요구한다. 허용된 화면이 사용할 메서드와 헤더만 명시적으로 알려준다.
    if (request.method === 'OPTIONS') {
      if (origin === undefined) {
        response.status(403).json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Soundry 화면에서 요청해 주세요.' } });
        return;
      }
      response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Soundry-Request');
      response.status(204).end();
      return;
    }

    // 변경 요청은 Origin과 JSON 또는 앱 전용 헤더가 모두 필요하다. 단순 form 전송이 mutation에 도달하지 않게 한다.
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
