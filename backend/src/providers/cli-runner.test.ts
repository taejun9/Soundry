import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLI_OUTPUT_LIMIT, CodexCliRunner, cliEnvironment, compositionArgs } from './cli-runner.js';

let root: string; let executable: string;
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
        const child = cp.spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'], { stdio: 'ignore' });
        fs.writeFileSync(pidFile, String(child.pid));
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
function runner(mode = 'good', timeoutMs = 2000) {
  return new CodexCliRunner({ executable: process.execPath, prefixArgs: [executable, mode, join(root, 'pid')], temporaryRoot: root, timeoutMs,
    environment: { HOME: root, PATH: '/usr/bin:/bin', USER: 'test', OPENAI_API_KEY: 'secret', CODEX_API_KEY: 'secret', FAL_KEY: 'secret', NODE_OPTIONS: '--unsafe', HTTP_PROXY: 'secret' } });
}
async function untilFile() { for (let i = 0; i < 100; i++) { try { return Number(readFileSync(join(root, 'pid'), 'utf8')); } catch { await delay(10); } } throw new Error('fixture did not start'); }
describe('bounded backend-only Codex CLI runner', () => {
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
  it('cancels before spawning and terminates a running whole process group, including stubborn descendants', async () => {
    const cancelled = new AbortController(); cancelled.abort();
    await expect(runner().compose('test', {}, cancelled.signal)).rejects.toMatchObject({ name: 'AbortError' });
    const controller = new AbortController();
    const result = runner('tree').compose('test', {}, controller.signal);
    const childPid = await untilFile(); controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await delay(30);
    expect(() => process.kill(childPid, 0)).toThrow();
    expect(readdirSync(root).sort()).toEqual(['fake.cjs', 'pid']);
  });
  it('enforces finite execution time even when the child ignores SIGTERM', async () => {
    await expect(runner('hang', 100).compose('test', {}, new AbortController().signal)).rejects.toMatchObject({ code: 'CLI_TIMEOUT' });
    expect(readdirSync(root).sort()).toEqual(['fake.cjs', 'pid']);
  });
});
