/** Explicit opt-in production UI gateway for a trusted private LAN. API starts via npm run dev. */
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readLanHost } from '../../shared/lan-config.js';
import { createLanGateway } from '../network/lan-server.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const envPath = join(root, '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
try {
  const host = readLanHost(process.env.SOUNDRY_LAN_HOST);
  const rawPort = process.env.UI_PORT ?? '5173';
  if (!host || !Object.values(networkInterfaces()).flat().some((address) => address?.address === host)) throw new Error('LAN_ADDRESS_UNAVAILABLE');
  if (!/^\d+$/.test(rawPort)) throw new Error('INVALID_LAN_CONFIG');
  if (!existsSync(join(root, 'frontend/dist/index.html'))) throw new Error('BUILD_REQUIRED');
  const port = Number(rawPort);
  const health = await fetch('http://127.0.0.1:3000/api/health', { headers: { Origin: `http://${host}:${port}` }, signal: AbortSignal.timeout(3000), redirect: 'error' });
  if (!health.ok || (await health.json()).service !== 'soundry-api') throw new Error('API_REQUIRED');
  const session = await fetch('http://127.0.0.1:3000/api/members/session', { signal: AbortSignal.timeout(3000), redirect: 'error' });
  if (!session.ok || (await session.json()).setupRequired !== false) throw new Error('ACCOUNT_REQUIRED');
  const server = createLanGateway(host, port, join(root, 'frontend/dist'));
  server.on('error', () => { console.error('Soundry LAN: 내부 IP와 포트 점유를 확인하세요.'); process.exitCode = 1; });
  server.listen(port, host, () => console.info(`Soundry LAN 준비 완료: http://${host}:${port} · 종료 Ctrl-C`));
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} catch (error) {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    ACCOUNT_REQUIRED: '맥북의 로컬 화면에서 회원 설정을 먼저 완료하세요.',
    BUILD_REQUIRED: 'npm run build를 먼저 실행하세요.',
    API_REQUIRED: '같은 설정으로 npm run dev를 먼저 실행하세요.',
    LAN_ADDRESS_UNAVAILABLE: 'SOUNDRY_LAN_HOST에 현재 맥북의 내부 IPv4를 지정하세요.',
  };
  console.error('Soundry LAN: ' + (messages[code] ?? '내부 IP, 포트, 로컬 API 설정을 확인하세요.'));
  process.exitCode = 1;
}
