import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { GenerationSummary, Page, PromptSummary } from '../../../shared/contracts.js';
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

  @Get('projects/:projectId/prompts')
  prompts(@Param('projectId') id: string, @Query() query: Record<string, unknown>): Page<PromptSummary> {
    const { limit, cursor } = generationListQuery(query);
    return this.generations.prompts(projectId(id), limit, cursor);
  }

  @Post('projects/:projectId/generations')
  create(@Param('projectId') id: string, @Body() body: unknown, @Res({ passthrough: true }) response: Response): GenerationSummary {
    const result = this.generations.create(projectId(id), body);
    response.status(result.status);
    return result.generation;
  }

  @Get('generations/:id')
  get(@Param('id') id: string): GenerationSummary { return this.generations.get(generationId(id)); }

  @Post('generations/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() body: unknown): GenerationSummary {
    if (body !== undefined && (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length !== 0)) throw new AppError(400, 'INVALID_INPUT', '취소 요청에는 추가 설정을 넣을 수 없습니다.');
    return this.generations.cancel(generationId(id));
  }
}
