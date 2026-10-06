/**
 * 프로젝트 REST 경계다. route/query/body를 검증한 뒤 서비스에 전달하며 DB·파일 처리는 서비스가 소유한다.
 * 이름 변경과 삭제는 별도 동작으로 노출하고 파일 경로를 클라이언트 입력으로 받지 않는다.
 */
import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { DeleteResult, Page, ProjectSummary } from '../../../shared/contracts.js';
import type { MemberRequest } from '../members/members.service.js';
import { projectId, projectListQuery, projectName } from './project-input.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>, @Req() request: MemberRequest): Page<ProjectSummary> {
    const { limit, cursor } = projectListQuery(query);
    return this.projects.list(limit, cursor, request.member?.id);
  }

  @Get(':id')
  get(@Param('id') id: string): ProjectSummary { return this.projects.get(projectId(id)); }

  @Post()
  create(@Body() body: unknown, @Req() request: MemberRequest): ProjectSummary { return this.projects.create(projectName(body), request.member?.id); }

  @Patch(':id')
  rename(@Param('id') id: string, @Body() body: unknown): ProjectSummary { return this.projects.rename(projectId(id), projectName(body)); }

  @Delete(':id')
  delete(@Param('id') id: string): DeleteResult { return this.projects.delete(projectId(id)); }
}
