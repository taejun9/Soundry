/**
 * 서버 연결 확인용 최소 응답이다. DB 경로·공급자 인증·환경변수는 health 응답에 포함하지 않는다.
 * 이 응답의 성공은 프로세스 접근 가능성을 뜻하며 실제 작곡 준비 여부는 공급자 API에서 별도로 확인한다.
 */
import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '../../shared/contracts.js';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'soundry-api' };
  }
}
