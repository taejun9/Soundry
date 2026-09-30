import { createApplication } from './app.js';
import { API_HOST, API_PORT } from './config/local-boundary.js';

async function bootstrap(): Promise<void> {
  if (process.env.API_PORT !== undefined && process.env.API_PORT !== String(API_PORT)) {
    throw new Error('INVALID_LOCAL_CONFIG');
  }
  if (process.env.API_HOST !== undefined && process.env.API_HOST !== API_HOST) {
    throw new Error('INVALID_LOCAL_CONFIG');
  }

  const app = await createApplication();
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  try {
    await app.listen(API_PORT, API_HOST);
    console.info(`Soundry API: http://${API_HOST}:${API_PORT}/api/health`);
  } catch (error) {
    await app.close();
    throw error;
  }
}

bootstrap().catch((error: unknown) => {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (code === 'EADDRINUSE') {
    console.error('Soundry API: 3000 포트가 사용 중입니다. 기존 프로세스를 종료한 뒤 다시 실행해 주세요.');
  } else if (error instanceof Error && error.message === 'INVALID_LOCAL_CONFIG') {
    console.error('Soundry API: API_HOST=127.0.0.1, API_PORT=3000 설정만 지원합니다.');
  } else if (error instanceof Error && error.message === 'INVALID_UI_PORT') {
    console.error('Soundry API: UI_PORT는 1024–65535 사이의 정수이며 API_PORT(3000)와 달라야 합니다.');
  } else if (error instanceof Error && ['UNSAFE_STORAGE_PATH', 'INVALID_DATA_DIRECTORY'].includes(error.message)) {
    console.error('Soundry API: 저장 폴더의 링크와 파일 상태를 확인해 주세요. SOUNDRY_DATA_DIR는 실제 디렉터리를 가리켜야 합니다.');
  } else if (error instanceof Error && error.message === 'UNSUPPORTED_DATABASE_SCHEMA') {
    console.error('Soundry API: 현재 앱에서 열 수 없는 데이터베이스입니다. 기존 데이터를 보존하고 앱 버전을 확인해 주세요.');
  } else {
    console.error('Soundry API를 시작하지 못했습니다. 설치, 저장 폴더 권한, 데이터베이스와 로컬 포트를 확인해 주세요.');
  }
  process.exitCode = 1;
});
