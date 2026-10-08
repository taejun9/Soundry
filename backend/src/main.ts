/**
 * 개발/배포 실행 파일의 진입점이다. API는 고정 loopback 주소에서만 열고 프로세스 신호로 정상 종료한다.
 * 시작 실패는 정제한 진단과 비정상 종료 코드로 알리며, 원시 예외나 환경변수 전체를 출력하지 않는다.
 */
import { createApplication } from './app.js';
import { API_HOST, API_PORT } from './config/local-boundary.js';

// 임의 host/port 환경설정으로 로컬 접근 경계가 넓어지는 것을 방지한다.
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
    // 포트 충돌 등 listen 실패에서도 초기화된 DB 잠금과 background probe를 반드시 반납한다.
    await app.close();
    throw error;
  }
}

// 오류별 사용자 조치만 안내한다. 예외의 stack/cause에는 로컬 경로나 입력이 있을 수 있어 출력하지 않는다.
bootstrap().catch((error: unknown) => {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (code === 'EADDRINUSE') {
    console.error('Soundry API: 3000 포트가 사용 중입니다. 기존 프로세스를 종료한 뒤 다시 실행해 주세요.');
  } else if (error instanceof Error && error.message === 'INVALID_LOCAL_CONFIG') {
    console.error('Soundry API: API_HOST=127.0.0.1, API_PORT=3000 설정만 지원합니다.');
  } else if (error instanceof Error && error.message === 'INVALID_MUSIC_PROVIDER') {
    console.error('Soundry API: MUSIC_PROVIDER=cli, ollama 또는 mock 설정만 지원합니다. 값을 확인한 뒤 다시 실행해 주세요.');
  } else if (error instanceof Error && ['INVALID_OLLAMA_PORT', 'INVALID_LOCAL_MODEL'].includes(error.message)) {
    console.error('Soundry API: 로컬 작곡 모델 이름과 1024–65535 범위의 Ollama 포트를 확인해 주세요. cloud 모델은 사용할 수 없습니다.');
  } else if (error instanceof Error && error.message === 'INVALID_UI_PORT') {
    console.error('Soundry API: UI_PORT는 1024–65535 사이의 정수이며 API_PORT(3000)와 달라야 합니다.');
  } else if (error instanceof Error && ['UNSAFE_STORAGE_PATH', 'INVALID_DATA_DIRECTORY'].includes(error.message)) {
    console.error('Soundry API: 저장 폴더의 링크와 파일 상태를 확인해 주세요. SOUNDRY_DATA_DIR는 실제 디렉터리를 가리켜야 합니다.');
  } else if (error instanceof Error && error.message === 'DATA_DIRECTORY_IN_USE') {
    console.error('Soundry API: 이 저장 폴더를 사용하는 서버가 이미 실행 중입니다. 기존 서버를 종료하거나 다른 SOUNDRY_DATA_DIR를 지정해 주세요.');
  } else if (error instanceof Error && error.message === 'UNSUPPORTED_DATABASE_SCHEMA') {
    console.error('Soundry API: 현재 앱에서 열 수 없는 데이터베이스입니다. 기존 데이터를 보존하고 앱 버전을 확인해 주세요.');
  } else {
    console.error('Soundry API를 시작하지 못했습니다. 설치, 저장 폴더 권한, 데이터베이스와 로컬 포트를 확인해 주세요.');
  }
  process.exitCode = 1;
});
