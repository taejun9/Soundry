/**
 * 기존 CLI 계정으로 작곡 텍스트를 실행하는 subprocess 경계다. shell을 사용하지 않고 입력은 stdin으로만 전달한다.
 * 임시 디렉터리·허용 환경변수·시간/출력 상한·프로세스 그룹 종료를 통해 앱 소유 실행의 범위를 제한한다.
 */
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { chmod, mkdir, mkdtemp, open, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProviderError } from './provider-error.js';

export const CLI_OUTPUT_LIMIT = 1024 * 1024;
export const CLI_COMPOSITION_TIMEOUT_MS = 240_000;
export type CliAvailability = 'ready' | 'CLI_NOT_INSTALLED' | 'CLI_LOGIN_REQUIRED' | 'CLI_AUTH_UNSUPPORTED' | 'CLI_UNAVAILABLE' | 'LOCAL_UNAVAILABLE' | 'LOCAL_MODEL_MISSING' | 'LOCAL_CLOUD_ENABLED';
export interface CompositionRunner {
  readonly modelLabel?: string;
  readonly compositionModelLabel?: string;
  probe(signal: AbortSignal): Promise<CliAvailability>;
  compose(prompt: string, schema: object, signal: AbortSignal): Promise<unknown>;
}
/** In-process test seams only. No HTTP or environment setting selects an executable/argument. */
// 실행 파일/인자는 테스트에서 가짜 child를 주입하는 내부 옵션이다. HTTP나 환경변수로 사용자가 선택하는 기능이 아니다.
export interface CodexRunnerOptions {
  executable?: string;
  prefixArgs?: readonly string[];
  environment?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  probeTimeoutMs?: number;
  temporaryRoot?: string;
}
const disabledFeatures = [
  'shell_tool', 'unified_exec', 'shell_snapshot', 'multi_agent', 'apps', 'plugins', 'hooks',
  'browser_use', 'browser_use_external', 'computer_use', 'in_app_browser', 'image_generation',
  'memories', 'goals', 'code_mode', 'workspace_dependencies', 'skill_mcp_dependency_install',
] as const;
/** Allow only CLI account discovery and OS basics; keys, proxies and injected Node options are excluded. */
// denylist 대신 최소 allowlist를 복사한다. 계정 탐색에 필요한 HOME/CODEX_HOME은 전달하되 인증 파일을 앱이 직접 읽지 않는다.
export function cliEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { TERM: 'dumb', NO_COLOR: '1' };
  for (const name of ['HOME', 'PATH', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'CODEX_HOME']) {
    if (source[name] !== undefined) result[name] = source[name];
  }
  return result;
}
// 개인 CLI 설정·도구·MCP·검색·기록을 명시적으로 제한하고 schema 기반 JSON만 받는다.
// ChatGPT 로그인만 선택하며 사용자 설정 파일을 수정하지 않는다.
export function compositionArgs(schema: string, output: string): string[] {
  return ['-a', 'never', 'exec', '--ignore-user-config', '--ephemeral',
    '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never',
    ...disabledFeatures.flatMap(feature => ['--disable', feature]),
    '-c', 'web_search="disabled"', '-c', 'forced_login_method="chatgpt"',
    '-c', 'project_doc_max_bytes=0', '-c', 'history.persistence="none"', '-c', 'mcp_servers={}',
    '--output-schema', schema, '--output-last-message', output, '-'];
}
export function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('작업이 중단되었습니다.', 'AbortError');
}
// stderr는 알려진 실패 분류를 찾는 데만 사용한다. 반환 오류는 앱이 소유하는 고정 문구다.
function classifyFailure(stderr: string): ProviderError {
  if (/usage limit|rate.?limit|quota exceeded|insufficient.quota|too many requests|429\b/i.test(stderr)) return new ProviderError('CLI_LIMIT_REACHED');
  if (/not logged in|login required|unauthorized|authentication|401\b/i.test(stderr)) return new ProviderError('CLI_LOGIN_REQUIRED');
  return new ProviderError('CLI_FAILED');
}

export class CodexCliRunner implements CompositionRunner {
  private readonly environment: NodeJS.ProcessEnv;
  private readonly timeoutMs: number;
  private readonly probeTimeoutMs: number;
  constructor(private readonly options: CodexRunnerOptions = {}) {
    this.environment = cliEnvironment(options.environment ?? process.env);
    this.timeoutMs = options.timeoutMs ?? CLI_COMPOSITION_TIMEOUT_MS;
    this.probeTimeoutMs = options.probeTimeoutMs ?? 3000;
    if (![this.timeoutMs, this.probeTimeoutMs].every(value => Number.isFinite(value) && value > 0 && value <= CLI_COMPOSITION_TIMEOUT_MS)) throw new Error('INVALID_CLI_TIMEOUT');
  }
  // 시스템 temp 경로를 실제 경로로 정규화하고 0700 개인 작업 디렉터리를 만든다.
  private async privateDirectory(): Promise<string> {
    const base = await realpath(this.options.temporaryRoot ?? tmpdir());
    const directory = await mkdtemp(join(base, 'soundry-cli-'));
    await chmod(directory, 0o700);
    return directory;
  }
  // stdout/stderr 합산 크기와 별도 출력 파일 크기를 모두 감시한다. 취소·시간초과 때 child 및 후손을 종료한다.
  private run(args: string[], cwd: string, input: string, signal: AbortSignal, timeoutMs: number, output?: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
    throwIfCancelled(signal);
    return new Promise((resolve, reject) => {
      const child = spawn(this.options.executable ?? 'codex', [...(this.options.prefixArgs ?? []), ...args], {
        cwd, env: this.environment, shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const stdout: Buffer[] = []; const stderr: Buffer[] = [];
      let bytes = 0; let stopped: Error | undefined; let settled = false;
      let killTimer: NodeJS.Timeout | undefined; let checkingOutput = false;
      const killGroup = (kind: NodeJS.Signals) => {
        if (!child.pid) return;
        try { if (process.platform === 'win32') child.kill(kind); else process.kill(-child.pid, kind); } catch { /* already exited */ }
      };
      // 먼저 정상 종료 신호를 보내고 응답하지 않으면 500ms 후 강제 종료한다. 최초 중단 사유를 유지한다.
      const stop = (reason: Error) => {
        if (stopped || settled) return;
        stopped = reason; child.stdin.destroy(); killGroup('SIGTERM');
        killTimer = setTimeout(() => killGroup('SIGKILL'), 500);
      };
      const abort = () => stop(new DOMException('작업이 중단되었습니다.', 'AbortError'));
      const timer = setTimeout(() => stop(new ProviderError('CLI_TIMEOUT')), timeoutMs);
      // Bound the output file even if a CLI implementation does not mirror it to stdout.
      const outputMonitor = output ? setInterval(() => {
        if (checkingOutput || settled) return;
        checkingOutput = true;
        void stat(output).then(info => { if (info.size > CLI_OUTPUT_LIMIT) stop(new ProviderError('CLI_OUTPUT_TOO_LARGE')); })
          .catch(() => undefined).finally(() => { checkingOutput = false; });
      }, 100) : undefined;
      // close/error 어느 경로에서도 타이머와 abort listener를 제거한다. 남은 후손이 앱 종료를 붙잡지 않게 한다.
      const cleanup = () => {
        settled = true; clearTimeout(timer); clearTimeout(killTimer); clearInterval(outputMonitor);
        signal.removeEventListener('abort', abort); killGroup('SIGKILL');
      };
      const collect = (chunks: Buffer[], data: Buffer) => {
        bytes += data.length;
        if (bytes > CLI_OUTPUT_LIMIT * 2) stop(new ProviderError('CLI_OUTPUT_TOO_LARGE'));
        else chunks.push(data);
      };
      child.stdout.on('data', (data: Buffer) => collect(stdout, data));
      child.stderr.on('data', (data: Buffer) => collect(stderr, data));
      child.stdin.on('error', () => { /* Exit status handles EPIPE without leaking input. */ });
      child.once('error', (error: NodeJS.ErrnoException) => { cleanup(); reject(error.code === 'ENOENT' ? new ProviderError('CLI_NOT_INSTALLED') : new ProviderError('CLI_UNAVAILABLE')); });
      child.once('close', code => {
        if (settled) return;
        cleanup();
        if (stopped) reject(stopped); else resolve({ code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
      });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort(); else child.stdin.end(input);
    });
  }
  // login status는 계정 상태만 확인한다. API-key 로그인은 별도 미지원 상태로 분류하고 원문은 공개하지 않는다.
  async probe(signal: AbortSignal): Promise<CliAvailability> {
    let directory: string | undefined;
    try {
      throwIfCancelled(signal); directory = await this.privateDirectory();
      const result = await this.run(['-c', 'model_reasoning_effort="medium"', 'login', 'status'], directory, '', signal, this.probeTimeoutMs);
      const status = result.stdout + '\n' + result.stderr;
      if (/Logged in using an? API key|Logged in using API key/i.test(status)) return 'CLI_AUTH_UNSUPPORTED';
      if (result.code === 0 && /(?:^|\n)Logged in using ChatGPT\s*(?:\n|$)/.test(status)) return 'ready';
      return result.code !== 0 && /not logged in/i.test(status) ? 'CLI_LOGIN_REQUIRED' : 'CLI_UNAVAILABLE';
    } catch (error) {
      throwIfCancelled(signal);
      return error instanceof ProviderError && error.code === 'CLI_NOT_INSTALLED' ? 'CLI_NOT_INSTALLED' : 'CLI_UNAVAILABLE';
    } finally { if (directory) await rm(directory, { recursive: true, force: true }); }
  }
  private compositionTail: Promise<void> = Promise.resolve();
  // 한 runner의 작곡 호출을 직렬화한다. 이전 실패를 tail에서 흡수해 이후 명시적 요청을 계속 처리할 수 있게 한다.
  compose(prompt: string, schema: object, signal: AbortSignal): Promise<unknown> {
    const result = this.compositionTail.then(() => this.composeOnce(prompt, schema, signal));
    this.compositionTail = result.then(() => undefined, () => undefined);
    return result;
  }
  // 비어 있는 cwd와 0600 schema/result 파일만 준비한다. 완료 후 성공/실패/취소 모두 전용 임시 디렉터리를 정리한다.
  private async composeOnce(prompt: string, schema: object, signal: AbortSignal): Promise<unknown> {
    throwIfCancelled(signal);
    const directory = await this.privateDirectory();
    try {
      const working = join(directory, 'work'); await mkdir(working, { mode: 0o700 });
      const schemaPath = join(directory, 'schema.json'); const output = join(directory, 'result.json');
      await writeFile(schemaPath, JSON.stringify(schema), { mode: 0o600, flag: 'wx' });
      await writeFile(output, '', { mode: 0o600, flag: 'wx' });
      const result = await this.run(compositionArgs(schemaPath, output), working, prompt, signal, this.timeoutMs, output);
      throwIfCancelled(signal);
      if (result.code !== 0) throw classifyFailure(result.stderr);
      // 출력 파일을 링크 없이 열고 inode 유형/크기/UTF-8을 검사한다. markdown에서 JSON 조각을 추측하지 않고 전체 JSON만 허용한다.
      const file = await open(output, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await file.stat();
        if (!info.isFile() || info.nlink !== 1) throw new ProviderError('CLI_INVALID_OUTPUT');
        if (info.size > CLI_OUTPUT_LIMIT) throw new ProviderError('CLI_OUTPUT_TOO_LARGE');
        const buffer = Buffer.alloc(CLI_OUTPUT_LIMIT + 1);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > CLI_OUTPUT_LIMIT) throw new ProviderError('CLI_OUTPUT_TOO_LARGE');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead));
        try { return JSON.parse(text) as unknown; } catch { throw new ProviderError('CLI_INVALID_OUTPUT'); }
      } finally { await file.close(); }
    } catch (error) {
      throwIfCancelled(signal);
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('CLI_INVALID_OUTPUT');
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}
