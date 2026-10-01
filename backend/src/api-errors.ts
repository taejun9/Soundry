/**
 * 외부에 공개할 오류와 내부 예외를 분리하는 API 경계다.
 * 사용자가 조치할 수 있도록 앱이 작성한 문구만 허용하고, SQL·경로·요청 본문·공급자 원문은 응답에 싣지 않는다.
 */
import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { ErrorRequestHandler, Response } from 'express';

type SafeError = { code: string; message: string };

// Only application-owned messages may cross the API boundary.
export class AppError extends HttpException {
  constructor(status: number, readonly publicCode: string, readonly publicMessage: string) {
    super(publicMessage, status);
  }
}

const errors: Record<number, SafeError> = {
  400: { code: 'INVALID_INPUT', message: '요청 내용을 확인해 주세요.' },
  403: { code: 'FORBIDDEN', message: '허용되지 않은 요청입니다.' },
  404: { code: 'NOT_FOUND', message: '요청한 항목을 찾을 수 없습니다.' },
  409: { code: 'CONFLICT', message: '현재 상태에서는 처리할 수 없습니다.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: '요청은 64 KiB 이하여야 합니다.' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: '지원하지 않는 요청 형식입니다.' },
  429: { code: 'TOO_MANY_REQUESTS', message: '잠시 후 다시 시도해 주세요.' },
  500: { code: 'INTERNAL_ERROR', message: '요청을 처리하지 못했습니다. 다시 시도해 주세요.' },
};

// 알려진 HTTP 상태는 고정 문구로 변환하고, 목록에 없는 오류는 내부 오류 문구로 축약한다.
function sendError(response: Response, status: number): void {
  response.status(status).json({ error: errors[status] ?? errors[500] });
}

// Express parser errors run before Nest routes. Never return their raw message/body.
// 본문 파서는 Nest controller보다 먼저 실행되므로 Express 단계에서 별도로 오류를 정제한다.
// 에러 객체에 포함될 수 있는 원문 JSON은 읽거나 응답에 복사하지 않는다.
export const jsonErrorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  const type = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined;
  const status = type === 'entity.too.large' ? 413
    : type === 'encoding.unsupported' || type === 'charset.unsupported' ? 415
      : type === 'entity.parse.failed' || type === 'request.aborted' || type === 'request.size.invalid' ? 400
        : 500;
  sendError(response, status);
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  // AppError만 검증된 공개 문구를 보유한다. 나머지 HttpException도 메시지는 신뢰하지 않는다.
  catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof AppError) {
      host.switchToHttp().getResponse<Response>().status(exception.getStatus()).json({ error: { code: exception.publicCode, message: exception.publicMessage } });
      return;
    }
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    sendError(host.switchToHttp().getResponse<Response>(), status);
  }
}
