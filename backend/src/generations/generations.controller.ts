/**
 * 생성 이력·프롬프트 이력·접수·취소를 연결하는 HTTP controller다.
 * 신규 접수 202와 같은 요청 재조회 200을 구분하며 재시도/재생성도 동일한 접수 경로를 사용한다.
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { GenerationSummary, Page, PromptSummary } from '../../../shared/contracts.js';
import type { MemberRequest } from '../members/members.service.js';
import { AppError } from '../api-errors.js';
import { projectId } from '../projects/project-input.js';
import { generationId, generationListQuery } from './generation-request.js';
import { GenerationsService } from './generations.service.js';

@Controller()
export class GenerationsController {
  constructor(@Inject(GenerationsService) private readonly generations: GenerationsService) {}

  @Get('projects/:projectId/generations')
  list(@Param('projectId') id: string, @Query() query: Record<string, unknown>): Page<GenerationSummary> {
    const { limit, cursor } = generationListQuery(query);
    return this.generations.list(projectId(id), limit, cursor);
  }

  // 프롬프트 이력은 Generation snapshot을 조회한다. 별도 복제 테이블을 만들거나 자동 생성하지 않는다.
  @Get('projects/:projectId/prompts')
  prompts(@Param('projectId') id: string, @Query() query: Record<string, unknown>): Page<PromptSummary> {
    const { limit, cursor } = generationListQuery(query);
    return this.generations.prompts(projectId(id), limit, cursor);
  }

  // 응답 상태는 실제로 새 job이 기록되었는지 service의 결과에 따라 결정한다.
  @Post('projects/:projectId/generations')
  create(@Param('projectId') id: string, @Body() body: unknown, @Req() request: MemberRequest, @Res({ passthrough: true }) response: Response): GenerationSummary {
    const result = this.generations.create(projectId(id), body, request.member?.id);
    response.status(result.status);
    return result.generation;
  }

  @Get('generations/:id')
  get(@Param('id') id: string): GenerationSummary { return this.generations.get(generationId(id)); }

  // 취소는 추가 음악 설정을 받지 않는 멱등 동작이다. 이미 끝난 작업은 현재 최종 상태를 그대로 반환한다.
  @Post('generations/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() body: unknown): GenerationSummary {
    if (body !== undefined && (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length !== 0)) throw new AppError(400, 'INVALID_INPUT', '취소 요청에는 추가 설정을 넣을 수 없습니다.');
    return this.generations.cancel(generationId(id));
  }
}
