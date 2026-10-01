/**
 * 실제 Codex 대신 임시 Node child를 실행해 subprocess 보안·크기·시간·취소 경계를 검증한다.
 * 합성 비밀 문자열은 노출 회귀 검사용이며 계정 인증 파일이나 네트워크를 사용하지 않는다.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLI_OUTPUT_LIMIT, CodexCliRunner, cliEnvironment, compositionArgs } from './cli-runner.js';

let root: string; let executable: string;
// 상태/잘못된 JSON/과대 출력/무응답/후손 프로세스를 선택적으로 재현하는 child 소스다. 테스트 종료가 소유 프로세스까지 끝내야 한다.
const fixture = String.raw`
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const mode = process.argv[2], pidFile = process.argv[3], args = process.argv.slice(4);
if (args.includes('status')) {
  if (mode === 'api') { console.error('Logged in using an API key - private-value'); process.exit(0); }
  if (mode === 'missing') { console.error('Not logged in'); process.exit(1); }
  if (mode === 'probe-hang') { setInterval(() => {}, 1000); }
  else { console.error('Logged in using ChatGPT'); process.exit(0); }
} else {
  let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', data => input += data);
  process.stdin.on('end', () => {
    const output = args[args.indexOf('--output-last-message') + 1];
    if (mode === 'invalid') { fs.writeFileSync(output, 'markdown' + String.fromCharCode(96).repeat(3) + '{}'); return; }
    if (mode === 'large-file') { fs.writeFileSync(output, Buffer.alloc(2 * 1024 * 1024)); setInterval(() => {}, 1000); return; }
    if (mode === 'large-stdout') { process.stdout.write(Buffer.alloc(3 * 1024 * 1024)); setInterval(() => {}, 1000); return; }
    if (mode === 'quota') { console.error('429 usage limit private-api-key /users/private/path'); process.exit(1); }
    if (mode === 'hang' || mode === 'tree') {
      process.on('SIGTERM', () => {});
      if (mode === 'tree') {
        // 후손이 SIGTERM 무시 handler를 설치한 뒤 직접 ready PID를 기록해야 실제 강제 종료 경계를 시험한다.
        cp.spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});require("node:fs").writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)', pidFile], { stdio: 'ignore' });
      } else fs.writeFileSync(pidFile, String(process.pid));
      setInterval(() => {}, 1000); return;
    }
    fs.writeFileSync(output, JSON.stringify({ args, input, cwdEntries: fs.readdirSync(process.cwd()), parentMode: fs.statSync(path.dirname(process.cwd())).mode & 511,
      cwdMode: fs.statSync(process.cwd()).mode & 511, outputMode: fs.statSync(output).mode & 511, env: process.env }));
  });
}
`;
beforeEach(() => { root = mkdtempSync('/private/tmp/soundry-cli-test-'); executable = join(root, 'fake.cjs'); writeFileSync(executable, fixture); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
// 실행 파일을 현재 Node로 고정하고 필요한 인자와 합성 환경만 주입한다. 사용자 CLI 실행을 테스트하지 않는다.
function runner(mode = 'good', timeoutMs = 2000) {
  return new CodexCliRunner({ executable: process.execPath, prefixArgs: [executable, mode, join(root, 'pid')], temporaryRoot: root, timeoutMs,
    environment: { HOME: root, PATH: '/usr/bin:/bin', USER: 'test', OPENAI_API_KEY: 'secret', CODEX_API_KEY: 'secret', FAL_KEY: 'secret', NODE_OPTIONS: '--unsafe', HTTP_PROXY: 'secret' } });
}
// SIGTERM handler 설치를 끝낸 프로세스만 PID를 기록한다. 부분 쓰기/빈 파일을 ready로 오인하지 않는다.
async function untilFile(): Promise<number> {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    try {
      const pid = Number(readFileSync(join(root, 'pid'), 'utf8'));
      if (Number.isInteger(pid) && pid > 0) return pid;
    } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    await delay(10);
  }
  throw new Error('Fixture did not publish its ready PID');
}
// parent의 close 이벤트와 OS의 후손 회수는 같은 순간이 아니다. 임의 sleep 대신 실제 PID 소멸(ESRCH)을 유한하게 기다린다.
async function untilExited(pid: number): Promise<void> {
  const deadline = Date.now() + 2000;
  for (;;) {
    try { process.kill(pid, 0); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return;
      throw error;
    }
    if (Date.now() >= deadline) throw new Error('Owned fixture process remained alive after termination');
    await delay(10);
  }
}
describe('bounded backend-only Codex CLI runner', () => {
  // shell처럼 보이는 입력도 stdin의 데이터로 보존되어야 한다. 인자/환경/권한/빈 cwd를 child 관점에서 검사한다.
  it('uses account auth only, isolated empty cwd, stdin and schema file, with tools/config disabled', async () => {
    const result = await runner().compose('private music concept $(not a command)', {}, new AbortController().signal) as {
      args: string[]; input: string; cwdEntries: string[]; cwdMode: number; parentMode: number; outputMode: number; env: Record<string, string>;
    };
    expect(result.input).toContain('$(not a command)'); expect(result.args.join(' ')).not.toContain('private music concept');
    expect(result.cwdEntries).toEqual([]); expect([result.cwdMode, result.parentMode, result.outputMode]).toEqual([0o700, 0o700, 0o600]);
    expect(result.args).toContain('--ignore-user-config'); expect(result.args).not.toContain('--ignore-rules'); expect(result.args).not.toContain('-m');
    expect(result.args).toContain('forced_login_method="chatgpt"'); expect(result.args).toContain('read-only');
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'FAL_KEY', 'NODE_OPTIONS', 'HTTP_PROXY']) expect(result.env[key]).toBeUndefined();
    expect(readdirSync(root)).toEqual(['fake.cjs']);
  });
  it('does not forward keys, endpoints, proxy, arbitrary token or config override variables', () => {
    expect(cliEnvironment({ HOME: '/test', PATH: '/bin', OPENAI_BASE_URL: 'bad', CODEX_ACCESS_TOKEN: 'bad', ANTHROPIC_API_KEY: 'bad', CUSTOM_TOKEN: 'bad' }))
      .toEqual({ TERM: 'dumb', NO_COLOR: '1', HOME: '/test', PATH: '/bin' });
    const args = compositionArgs('schema', 'output');
    expect(args.slice(0, 3)).toEqual(['-a', 'never', 'exec']);
    for (const feature of ['shell_tool', 'unified_exec', 'multi_agent', 'apps', 'plugins', 'hooks', 'computer_use']) expect(args).toContain(feature);
  });
  it('distinguishes installed ChatGPT login, API-key auth and missing login without exposing output', async () => {
    const signal = new AbortController().signal;
    expect(await runner().probe(signal)).toBe('ready');
    expect(await runner('api').probe(signal)).toBe('CLI_AUTH_UNSUPPORTED');
    expect(await runner('missing').probe(signal)).toBe('CLI_LOGIN_REQUIRED');
    const absent = new CodexCliRunner({ executable: join(root, 'no-such-cli'), temporaryRoot: root });
    expect(await absent.probe(signal)).toBe('CLI_NOT_INSTALLED');
    expect(readdirSync(root)).toEqual(['fake.cjs']);
  });
  it('bounds readiness time without an account call and removes its directory', async () => {
    const probe = new CodexCliRunner({ executable: process.execPath, prefixArgs: [executable, 'probe-hang', ''], temporaryRoot: root, probeTimeoutMs: 30 });
    expect(await probe.probe(new AbortController().signal)).toBe('CLI_UNAVAILABLE');
    expect(readdirSync(root)).toEqual(['fake.cjs']);
  });
  it('rejects malformed JSON without accepting markdown or scanning for a JSON substring', async () => {
    await expect(runner('invalid').compose('test', {}, new AbortController().signal)).rejects.toMatchObject({ code: 'CLI_INVALID_OUTPUT' });
  });
  // stdout만 제한하면 output-last-message 파일로 우회할 수 있으므로 두 경로를 각각 과대 출력으로 시험한다.
  it('bounds both output streams and the output file and cleans partial results', async () => {
    expect(CLI_OUTPUT_LIMIT).toBe(1024 * 1024);
    for (const mode of ['large-file', 'large-stdout']) {
      await expect(runner(mode).compose('test', {}, new AbortController().signal)).rejects.toMatchObject({ code: 'CLI_OUTPUT_TOO_LARGE' });
      expect(readdirSync(root)).toEqual(['fake.cjs']);
    }
  });
  it('exposes only a curated quota error with no stderr/key/local path', async () => {
    await expect(runner('quota').compose('test', {}, new AbortController().signal)).rejects.toMatchObject({ code: 'CLI_LIMIT_REACHED' });
    try { await runner('quota').compose('test', {}, new AbortController().signal); }
    catch (error) { expect(String(error)).not.toMatch(/private|api-key|users|429/); }
  });
  // SIGTERM을 무시하는 후손까지 만들어 최종 SIGKILL과 그룹 종료가 필요한 상황을 확인한다.
  it('cancels before spawning and terminates a running whole process group, including stubborn descendants', async () => {
    const cancelled = new AbortController(); cancelled.abort();
    await expect(runner().compose('test', {}, cancelled.signal)).rejects.toMatchObject({ name: 'AbortError' });
    const controller = new AbortController();
    const result = runner('tree').compose('test', {}, controller.signal);
    // 준비 대기 중의 조기 실패도 처리하고, 아래 원래 promise assertion으로 실제 오류 종류를 검증한다.
    void result.catch(() => undefined);
    try {
      const childPid = await untilFile();
      expect(() => process.kill(childPid, 0)).not.toThrow();
      controller.abort();
      await expect(result).rejects.toMatchObject({ name: 'AbortError' });
      await untilExited(childPid);
      expect(readdirSync(root).sort()).toEqual(['fake.cjs', 'pid']);
    } finally { controller.abort(); await result.catch(() => undefined); }
  });
  it('enforces finite execution time even when the child ignores SIGTERM', async () => {
    const controller = new AbortController();
    // 100ms 안에 Node가 시작한다고 가정하지 않는다. 다른 fixture와 같은 실행 예산에서 실제 handler 준비를 먼저 확인한다.
    const result = runner('hang').compose('test', {}, controller.signal);
    void result.catch(() => undefined);
    try {
      const pid = await untilFile();
      expect(() => process.kill(pid, 0)).not.toThrow();
      await expect(result).rejects.toMatchObject({ code: 'CLI_TIMEOUT' });
      await untilExited(pid);
      expect(readdirSync(root).sort()).toEqual(['fake.cjs', 'pid']);
    } finally { controller.abort(); await result.catch(() => undefined); }
  });
});
