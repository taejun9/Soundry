import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import type { DeleteResult, Page, ProjectSummary } from '../../../shared/contracts.js';
import { projectId, projectListQuery, projectName } from './project-input.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>): Page<ProjectSummary> {
    const { limit, cursor } = projectListQuery(query);
    return this.projects.list(limit, cursor);
  }

  @Get(':id')
  get(@Param('id') id: string): ProjectSummary { return this.projects.get(projectId(id)); }

  @Post()
  create(@Body() body: unknown): ProjectSummary { return this.projects.create(projectName(body)); }

  @Patch(':id')
  rename(@Param('id') id: string, @Body() body: unknown): ProjectSummary { return this.projects.rename(projectId(id), projectName(body)); }

  @Delete(':id')
  delete(@Param('id') id: string): DeleteResult { return this.projects.delete(projectId(id)); }
}
