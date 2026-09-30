import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

export default defineConfig(({ mode }) => {
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
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
    preview: { host: '127.0.0.1', port, strictPort: true },
  };
});
