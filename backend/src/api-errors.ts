import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { ErrorRequestHandler, Response } from 'express';

type SafeError = { code: string; message: string };

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

function sendError(response: Response, status: number): void {
  response.status(status).json({ error: errors[status] ?? errors[500] });
}

// Express parser errors run before Nest routes. Never return their raw message/body.
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
  catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    sendError(host.switchToHttp().getResponse<Response>(), status);
  }
}
