/**
 * 실제 개발 launcher·API·Vite proxy·종료 동작을 함께 검사하는 smoke다.
 * 외부 작곡을 하지 않는 Mock과 고유 임시 data root를 써 사용자의 DB와 음원을 보호한다.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const launcher = fileURLToPath(new URL('./dev.mjs', import.meta.url));
const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
const uiPort = Number(process.env.UI_PORT ?? '5173');
// macOS tmpdir의 symlink를 먼저 해소해 backend 저장 경계 검사를 정상 경로로 통과시킨다.
const dataDir = await realpath(await mkdtemp(join(tmpdir(), 'soundry-smoke-')));
const isolatedEnv = { ...process.env, SOUNDRY_DATA_DIR: dataDir, MUSIC_PROVIDER: 'mock' };
const logs = [];
let ready = false;
const child = spawn(process.execPath, [launcher], { cwd: root, env: isolatedEnv, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
child.stderr.on('data', (chunk) => logs.push(chunk.toString()));
const finished = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
/** 서버 준비를 유한한 횟수로 확인한다. launcher가 먼저 종료되면 불필요한 polling을 중단한다. */
async function getReady(url) {
  for (let count = 0; count < 100; count++) {
    if (child.exitCode !== null) throw new Error('개발 서버가 준비 전에 종료되었습니다.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response;
    } catch { /* 서버 준비 중 fetch 오류를 재시도하며 아래 count 한도로 끝낸다. */ }
    await delay(150);
  }
  throw new Error('개발 서버 준비 시간이 초과되었습니다.');
}
/** 종료 뒤 같은 포트에 실제 bind해 자식 서버가 남지 않았음을 검증한다. */
async function canBind(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
try {
  const api = await getReady('http://127.0.0.1:3000/api/health');
  assert.deepEqual(await api.json(), { status: 'ok', service: 'soundry-api' });
  const proxy = await getReady(`http://127.0.0.1:${uiPort}/api/health`);
  assert.deepEqual(await proxy.json(), { status: 'ok', service: 'soundry-api' });
  const page = await fetch(`http://127.0.0.1:${uiPort}/`);
  assert.match(await page.text(), /Soundry/);
  ready = true;
  // 실행 중인 첫 서버를 건드리지 않고 두 번째 launcher가 명확한 충돌 오류로 종료하는지 본다.
  const collision = spawn(process.execPath, [launcher], { cwd: root, env: isolatedEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let collisionError = '';
  collision.stderr.on('data', (chunk) => { collisionError += chunk.toString(); });
  const code = await new Promise((resolve) => collision.once('exit', resolve));
  assert.equal(code, 1);
  assert.match(collisionError, /3000.*포트/);
  console.log('Soundry smoke 통과: API, Vite proxy, UI entry, 포트 충돌');
} catch (error) {
  console.error(logs.join(''));
  throw error;
} finally {
  if (child.exitCode === null) child.kill('SIGINT');
  const code = await Promise.race([finished, delay(8000).then(() => 'timeout')]);
  // 종료가 확인되지 않으면 살아 있는 서버의 저장소를 삭제하지 않는다.
  if (code !== 'timeout') await rm(dataDir, { recursive: true, force: true });
  if (ready) {
    assert.equal(code, 0, 'Ctrl-C가 두 프로세스를 정상 종료해야 합니다.');
    await canBind(3000);
    await canBind(uiPort);
    console.log('Soundry smoke 통과: Ctrl-C 이후 두 포트 해제');
  }
}
