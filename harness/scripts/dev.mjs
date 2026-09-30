import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const envPath = join(root, '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
if ((process.env.API_PORT && process.env.API_PORT !== '3000') ||
    (process.env.API_HOST && process.env.API_HOST !== '127.0.0.1')) {
  console.error('Soundry: 개발 API는 API_HOST=127.0.0.1, API_PORT=3000이어야 합니다.');
  process.exit(1);
}
const rawUiPort = process.env.UI_PORT ?? '5173';
if (!/^\d+$/.test(rawUiPort) || !Number.isInteger(Number(rawUiPort)) || Number(rawUiPort) < 1024 || Number(rawUiPort) > 65535 || Number(rawUiPort) === 3000) {
  console.error('Soundry: UI_PORT는 1024–65535 정수이며 API 포트 3000과 달라야 합니다.');
  process.exit(1);
}
const uiPort = Number(rawUiPort);

async function assertAvailable(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error(`Soundry: 127.0.0.1:${port} 포트를 사용할 수 없습니다. 사용 중인 앱을 종료하고 다시 실행하세요.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
try {
  await assertAvailable(3000);
  await assertAvailable(uiPort);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const children = [];
let stopping = false;
let monitor;
function signalGroup(child, signal) {
  if (!child.pid) return false;
  try { process.kill(-child.pid, signal); return true; } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return false;
  }
}
function stop(code) {
  if (stopping) return;
  stopping = true;
  clearInterval(monitor);
  process.exitCode = code;
  children.forEach((child) => signalGroup(child, 'SIGTERM'));
  // An exited wrapper is not proof that its process group has exited.
  const forceTimer = setTimeout(() => {
    children.forEach((child) => signalGroup(child, 'SIGKILL'));
  }, 5000);
  const cleanup = setInterval(() => {
    if (children.every((child) => !signalGroup(child, 0))) {
      clearTimeout(forceTimer);
      clearInterval(cleanup);
    }
  }, 50);
}
const commands = [
  { name: 'backend', args: ['--watch', '--watch-preserve-output', '--import', 'tsx', 'src/main.ts'] },
  { name: 'frontend', args: [join(dirname(require.resolve('vite/package.json')), 'bin/vite.js')] },
];
for (const { name, args } of commands) {
  const child = spawn(process.execPath, args, {
    cwd: join(root, name), stdio: 'inherit', detached: true,
    env: { ...process.env, API_PORT: '3000', UI_PORT: String(uiPort) },
  });
  children.push(child);
  child.once('error', () => {
    console.error(`Soundry: ${name} 실행 실패. npm install 결과를 확인하세요.`);
    stop(1);
  });
  child.once('exit', () => {
    if (!stopping) {
      console.error(`Soundry: ${name}가 종료되어 모든 개발 서버를 정리합니다.`);
      stop(1);
    }
  });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

let checking = false;
let ready = false;
let failures = 0;
const started = Date.now();
async function checkServers() {
  if (checking || stopping) return;
  checking = true;
  try {
    const api = await fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(1000) });
    if (!api.ok || (await api.json()).service !== 'soundry-api') throw new Error('API_NOT_READY');
    const ui = await fetch(`http://127.0.0.1:${uiPort}/`, { signal: AbortSignal.timeout(1000) });
    if (!ui.ok) throw new Error('UI_NOT_READY');
    failures = 0;
    if (!ready && !stopping) {
      ready = true;
      console.log(`Soundry 준비 완료: http://127.0.0.1:${uiPort} · 종료 Ctrl-C`);
    }
  } catch {
    failures++;
    if (!stopping && ((!ready && Date.now() - started > 15_000) || (ready && failures >= 5))) {
      console.error('Soundry: 개발 서버가 응답하지 않아 모두 종료합니다. 위 오류를 수정한 뒤 다시 실행하세요.');
      stop(1);
    }
  } finally { checking = false; }
}
monitor = setInterval(() => { void checkServers(); }, 1000);
void checkServers();
