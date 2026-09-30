import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const launcher = fileURLToPath(new URL('./dev.mjs', import.meta.url));
const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
const uiPort = Number(process.env.UI_PORT ?? '5173');
const logs = [];
let ready = false;
const child = spawn(process.execPath, [launcher], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
child.stderr.on('data', (chunk) => logs.push(chunk.toString()));
const finished = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
async function getReady(url) {
  for (let count = 0; count < 100; count++) {
    if (child.exitCode !== null) throw new Error('개발 서버가 준비 전에 종료되었습니다.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response;
    } catch { /* bounded startup polling */ }
    await delay(150);
  }
  throw new Error('개발 서버 준비 시간이 초과되었습니다.');
}
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
  const collision = spawn(process.execPath, [launcher], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
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
  if (ready) {
    assert.equal(code, 0, 'Ctrl-C가 두 프로세스를 정상 종료해야 합니다.');
    await canBind(3000);
    await canBind(uiPort);
    console.log('Soundry smoke 통과: Ctrl-C 이후 두 포트 해제');
  }
}
