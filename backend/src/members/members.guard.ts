import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { MembersService, type MemberRequest } from './members.service.js';
import { DatabaseService } from '../database/database.service.js';
import { AppError } from '../api-errors.js';
@Injectable()
export class MembersGuard implements CanActivate {
  constructor(
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<MemberRequest>();
    request.member = this.members.session(request);
    // Express route matching is case-insensitive; authorization must use the same normalization.
    const path = request.path.toLowerCase().replace(/^\/api/, '');
    if (
      path === '/health' ||
      path === '/providers/current' ||
      path === '/members/plans' ||
      path === '/members/session' ||
      path === '/members/register' ||
      path === '/members/login' ||
      path === '/members/logout'
    )
      return true;
    if (!this.members.hasMembers() && !path.startsWith('/members')) return true;
    if (!request.member) throw new AppError(401, 'LOGIN_REQUIRED', '로그인 후 이용해 주세요.');
    if (path.startsWith('/members')) {
      if (request.member.tier !== 'admin')
        throw new AppError(403, 'ADMIN_REQUIRED', '관리자 권한이 필요합니다.');
      return true;
    }
    const project = path.match(/^\/projects\/([^/]+)/);
    if (project) this.members.assertProject(project[1]!, request.member);
    const resource = path.match(/^\/(generations|tracks)\/([^/]+)/);
    if (resource) {
      const sql =
        resource[1] === 'generations'
          ? 'SELECT project_id FROM generations WHERE id=?'
          : 'SELECT g.project_id FROM tracks t JOIN generations g ON g.id=t.generation_id WHERE t.id=?';
      const row = this.database.client.prepare(sql).get(resource[2]!.toLowerCase()) as
        { project_id: string } | undefined;
      if (!row) throw new AppError(404, 'NOT_FOUND', '항목을 찾을 수 없습니다.');
      this.members.assertProject(row.project_id, request.member);
    }
    return true;
  }
}
