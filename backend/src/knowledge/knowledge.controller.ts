import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from '../api-errors.js';
import type { MemberRequest } from '../members/members.service.js';
import { generationId } from '../generations/generation-request.js';
import { KnowledgeService } from './knowledge.service.js';
function member(request: MemberRequest): string {
  if (!request.member) throw new AppError(401, 'LOGIN_REQUIRED', '작곡 지식은 로그인 후 이용해 주세요.');
  return request.member.id;
}
@Controller()
export class KnowledgeController {
  constructor(@Inject(KnowledgeService) private readonly knowledge: KnowledgeService) {}
  @Get('knowledge') list(@Req() r: MemberRequest) { return { items: this.knowledge.list(member(r)) }; }
  @Post('knowledge/curated/import') importCurated(@Req() r: MemberRequest, @Body() body: unknown) {
    if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length) throw new AppError(400, 'INVALID_INPUT', '기본 자료 추가에는 다른 입력이 필요하지 않습니다.');
    return this.knowledge.importCurated(member(r));
  }
  @Post('knowledge') create(@Req() r: MemberRequest, @Body() body: unknown) { return this.knowledge.save(member(r), body); }
  @Patch('knowledge/:id') update(@Req() r: MemberRequest, @Param('id') id: string, @Body() body: unknown) { return this.knowledge.save(member(r), body, generationId(id)); }
  @Delete('knowledge/:id') remove(@Req() r: MemberRequest, @Param('id') id: string) { return this.knowledge.remove(generationId(id), member(r)); }
  @Post('tracks/:id/feedback') feedback(@Req() r: MemberRequest, @Param('id') id: string, @Body() body: unknown) { return this.knowledge.feedback(generationId(id), member(r), body); }
  @Get('tracks/:id/composition.mid') midi(@Param('id') id: string, @Res() response: Response) {
    const bytes = this.knowledge.midi(generationId(id));
    response.set({ 'Content-Type': 'audio/midi', 'Content-Disposition': 'attachment; filename="soundry-composition.mid"', 'Cache-Control': 'no-store' }).send(bytes);
  }
  @Get('tracks/:id/composition') composition(@Param('id') id: string) { return this.knowledge.composition(generationId(id)); }
  @Get('generations/:id/knowledge') references(@Param('id') id: string) { return { items: this.knowledge.references(generationId(id)) }; }
}
