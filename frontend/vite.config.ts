/**
 * 프런트엔드 개발·빌드 설정. Vue SFC와 Tailwind를 처리하고 로컬 API를 같은 출처의 /api로 연결한다.
 * 포트는 서버의 Origin 허용 정책과 일치해야 하므로 잘못된 값이나 포트 점유를 자동 우회하지 않는다.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

export default defineConfig(({ mode }) => {
  // 명시적인 프로세스 환경 변수가 저장소 .env보다 우선한다. UI_PORT만 읽고 비밀을 VITE 변수로 만들지 않는다.
  const configuredPort = process.env.UI_PORT ?? loadEnv(mode, repositoryRoot, 'UI_PORT').UI_PORT ?? '5173';
  const port = Number(configuredPort);
  if (!/^\d+$/.test(configuredPort) || !Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000) {
    throw new Error('UI_PORT는 1024–65535의 정수여야 하며 API 포트 3000은 사용할 수 없습니다.');
  }

  return {
    envDir: repositoryRoot,
    plugins: [vue(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      port,
      // 허용 Origin과 다른 포트로 조용히 이동하지 않고 충돌을 사용자에게 드러낸다.
      strictPort: true,
      proxy: {
        // 브라우저는 같은 출처만 사용하고 프록시가 고정된 loopback API에 연결한다.
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    preview: { host: '127.0.0.1', port, strictPort: true },
  };
});
