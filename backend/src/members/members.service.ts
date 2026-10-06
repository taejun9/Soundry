import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type {
  MemberSummary,
  MembershipPlan,
  MembershipTier,
  UsageSummary,
} from '../../../shared/contracts.js';
import { AppError } from '../api-errors.js';
import { DatabaseService } from '../database/database.service.js';

export const membershipPlans: MembershipPlan[] = [
  { tier: 'free', name: 'Free', monthlyLimit: 10 },
  { tier: 'plus', name: 'Plus', monthlyLimit: 100 },
  { tier: 'pro', name: 'Pro', monthlyLimit: 500 },
  { tier: 'admin', name: '관리자', monthlyLimit: null },
];
export interface MemberRequest extends Request {
  member?: MemberSummary;
}
type StoredMember = MemberSummary & { password_hash: string; created_at: string };
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
const publicMember = (row: StoredMember): MemberSummary => ({
  id: row.id,
  email: row.email,
  name: row.name,
  tier: row.tier,
  createdAt: row.created_at,
});
export function record(body: unknown, fields: string[]): Record<string, unknown> {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !fields.includes(k))
  )
    throw new AppError(400, 'INVALID_INPUT', '입력 항목을 확인해 주세요.');
  return body as Record<string, unknown>;
}
function credentials(body: unknown, register: boolean) {
  const value = record(body, register ? ['email', 'password', 'name'] : ['email', 'password']);
  if (
    typeof value.email !== 'string' ||
    value.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim()) ||
    typeof value.password !== 'string' ||
    value.password.length < 10 ||
    value.password.length > 128
  )
    throw new AppError(400, 'INVALID_INPUT', '이메일과 10–128자 비밀번호를 입력해 주세요.');
  if (
    register &&
    (typeof value.name !== 'string' ||
      !value.name.trim() ||
      value.name.trim().length > 80 ||
      value.name.includes('\0'))
  )
    throw new AppError(400, 'INVALID_INPUT', '이름은 1–80자로 입력해 주세요.');
  return {
    email: value.email.trim().toLowerCase(),
    password: value.password,
    name: register ? (value.name as string).trim() : '',
  };
}

@Injectable()
export class MembersService {
  private attempts = { count: 0, reset: 0 };
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  hasMembers(): boolean {
    return Boolean(this.database.client.prepare('SELECT 1 FROM members LIMIT 1').get());
  }
  private throttle() {
    const now = Date.now();
    if (now > this.attempts.reset) this.attempts = { count: 0, reset: now + 60_000 };
    if (++this.attempts.count > 20)
      throw new AppError(429, 'AUTH_RATE_LIMIT', '인증 요청이 많습니다. 1분 후 다시 시도해 주세요.');
  }
  async register(body: unknown) {
    this.throttle();
    const input = credentials(body, true);
    const salt = randomBytes(16).toString('hex');
    const hash = `${salt}:${(await derive(input.password, salt)).toString('hex')}`;
    const member = this.database.client
      .transaction(() => {
        if (this.database.client.prepare('SELECT 1 FROM members WHERE email=?').get(input.email))
          throw new AppError(409, 'EMAIL_EXISTS', '이미 등록된 이메일입니다.');
        const first = !this.hasMembers();
        const id = randomUUID();
        const now = new Date().toISOString();
        this.database.client
          .prepare('INSERT INTO members VALUES(?,?,?,?,?,?)')
          .run(id, input.email, input.name, hash, first ? 'admin' : 'free', now);
        if (first)
          this.database.client.prepare('UPDATE projects SET member_id=? WHERE member_id IS NULL').run(id);
        return this.get(id);
      })
      .immediate();
    return { member, token: this.newSession(member.id) };
  }
  async login(body: unknown) {
    this.throttle();
    const input = credentials(body, false);
    const row = this.database.client.prepare('SELECT * FROM members WHERE email=?').get(input.email) as
      StoredMember | undefined;
    const [salt, expected] = (row?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
    const actual = await derive(input.password, salt!);
    if (!timingSafeEqual(actual, Buffer.from(expected!, 'hex')) || !row)
      throw new AppError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.');
    return { member: publicMember(row), token: this.newSession(row.id) };
  }
  private newSession(id: string): string {
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    this.database.client.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
    this.database.client
      .prepare('INSERT INTO sessions VALUES(?,?,?)')
      .run(hashToken(token), id, new Date(now.getTime() + 7 * 86400_000).toISOString());
    return token;
  }
  private token(request: Request): string | undefined {
    return request.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('soundry_session='))
      ?.slice(16);
  }
  session(request: Request): MemberSummary | undefined {
    const token = this.token(request);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    const row = this.database.client
      .prepare(
        'SELECT m.* FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.token_hash=? AND s.expires_at > ?',
      )
      .get(hashToken(token), new Date().toISOString()) as StoredMember | undefined;
    return row ? publicMember(row) : undefined;
  }
  logout(request: Request): void {
    const token = this.token(request);
    if (token) this.database.client.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
  }
  get(id: string): MemberSummary {
    const row = this.database.client.prepare('SELECT * FROM members WHERE id=?').get(id) as
      StoredMember | undefined;
    if (!row) throw new AppError(404, 'NOT_FOUND', '회원을 찾을 수 없습니다.');
    return publicMember(row);
  }
  list(): MemberSummary[] {
    return (
      this.database.client.prepare('SELECT * FROM members ORDER BY created_at,id').all() as StoredMember[]
    ).map(publicMember);
  }
  changeTier(id: string, body: unknown): MemberSummary {
    const input = record(body, ['tier']);
    const tier = input.tier as MembershipTier;
    if (!membershipPlans.some((p) => p.tier === tier))
      throw new AppError(400, 'INVALID_INPUT', '등급을 확인해 주세요.');
    return this.database.client
      .transaction(() => {
        const current = this.get(id);
        if (
          current.tier === 'admin' &&
          tier !== 'admin' &&
          (
            this.database.client
              .prepare("SELECT count(*) AS count FROM members WHERE tier='admin'")
              .get() as { count: number }
          ).count <= 1
        )
          throw new AppError(409, 'LAST_ADMIN', '마지막 관리자의 권한은 해제할 수 없습니다.');
        this.database.client.prepare('UPDATE members SET tier=? WHERE id=?').run(tier, id);
        return this.get(id);
      })
      .immediate();
  }
  usage(member: MemberSummary): UsageSummary {
    // Monthly periods use Korea time, with UTC boundaries stored in the ledger.
    const now = new Date(Date.now() + 9 * 3600_000);
    const month = now.toISOString().slice(0, 7);
    const start = new Date(`${month}-01T00:00:00+09:00`);
    // Compute next local month from its calendar, avoiding Jan 31 / UTC-boundary overflow.
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 9 * 3600_000);
    const used = (
      this.database.client
        .prepare(
          "SELECT coalesce(sum(amount),0) AS used FROM usage_entries WHERE member_id=? AND created_at>=? AND created_at<? AND status IN ('queued','processing','completed')",
        )
        .get(member.id, start.toISOString(), next.toISOString()) as { used: number }
    ).used;
    const limit = membershipPlans.find((p) => p.tier === member.tier)!.monthlyLimit;
    return { month, used, limit, remaining: limit === null ? null : Math.max(0, limit - used) };
  }
  assertQuota(id: string, count: number) {
    const usage = this.usage(this.get(id));
    if (usage.remaining !== null && usage.remaining < count)
      throw new AppError(
        429,
        'USAGE_LIMIT',
        '이번 달 생성 한도를 초과합니다. 사용량과 회원 등급을 확인해 주세요.',
      );
  }
  assertProject(id: string, member: MemberSummary) {
    const row = this.database.client
      .prepare('SELECT member_id FROM projects WHERE id=?')
      .get(id.toLowerCase()) as { member_id: string | null } | undefined;
    if (!row || row.member_id !== member.id)
      throw new AppError(404, 'NOT_FOUND', '프로젝트를 찾을 수 없습니다.');
  }
}
