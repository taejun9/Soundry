/** 앱의 TS 회귀 테스트 설정. Node test runner와 Python 음악 도구 QA는 qa:music에서 실행한다. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // DOM이 필요한 frontend 상태 테스트는 주입한 대역을 사용하고 실제 브라우저 QA는 별도로 수행한다.
    environment: 'node',
    include: ['backend/src/**/*.test.ts', 'frontend/src/**/*.test.ts', 'harness/**/*.test.ts'],
    // DB·서버를 띄우는 통합 테스트도 유한한 시간 안에 실패하도록 제한한다.
    testTimeout: 15_000,
  },
});
