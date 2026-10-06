import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MembersService, membershipPlans, type MemberRequest } from './members.service.js';
import { projectId } from '../projects/project-input.js';
@Controller('members')
export class MembersController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}
  @Get('plans') plans() {
    return { items: membershipPlans };
  }
  @Get('session') session(@Req() req: MemberRequest) {
    return {
      member: req.member ?? null,
      setupRequired: !this.members.hasMembers(),
      usage: req.member ? this.members.usage(req.member) : null,
    };
  }
  @Post('register') async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const result = await this.members.register(body);
    this.cookie(res, result.token);
    return { member: result.member };
  }
  @Post('login') @HttpCode(200) async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.members.login(body);
    this.cookie(res, result.token);
    return { member: result.member };
  }
  @Post('logout') @HttpCode(200) logout(
    @Req() req: MemberRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.members.logout(req);
    res.clearCookie('soundry_session', { path: '/', httpOnly: true, sameSite: 'strict' });
    return { loggedOut: true };
  }
  @Get() list() {
    return { items: this.members.list() };
  }
  @Patch(':id') changeTier(@Param('id') id: string, @Body() body: unknown) {
    return this.members.changeTier(projectId(id), body);
  }
  private cookie(res: Response, token: string) {
    res.cookie('soundry_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 86400_000,
    });
    res.setHeader('Cache-Control', 'no-store');
  }
}
