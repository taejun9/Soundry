/**
 * 서로 다른 runtime의 음악 도구 QA를 순차 실행한다. 두 검사 모두 외부 작곡을 호출하지 않는다.
 * NumPy가 있는 Python을 SOUNDRY_PYTHON으로 명시할 수 있으며 의존성을 자동 설치하지 않는다.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const python = process.env.SOUNDRY_PYTHON || 'python3';

/** shell 없이 실행해 공백이 든 interpreter 경로도 하나의 executable로 전달한다. */
function run(command, args, stdio = 'inherit') {
  return spawnSync(command, args, { cwd: root, stdio });
}

// 검사가 시작된 뒤 대용량 fixture를 만들기 전에 Python/NumPy 준비 여부를 확인한다.
const readiness = run(python, ['-c', 'import sys, numpy; sys.exit(0 if sys.version_info >= (3, 10) else 1)'], 'ignore');
if (readiness.error || readiness.status !== 0) {
  console.error('Soundry 음악 QA: NumPy를 사용할 수 있는 Python 3.10 이상이 필요합니다. SOUNDRY_PYTHON에 해당 Python 실행 경로를 지정하세요.');
  process.exitCode = 1;
} else {
  // 첫 실패의 종료 코드를 보존하고 다음 검사는 실행하지 않는다.
  const commands = [
    [process.execPath, ['--test', 'harness/music/cli_batch_runner.test.mjs']],
    [python, ['harness/music/qa_audio_tools.py']],
  ];
  for (const [command, args] of commands) {
    const result = run(command, args);
    if (result.error || result.status !== 0) {
      console.error('Soundry 음악 QA가 실패했습니다. 위 검사 결과와 실행 환경을 확인하세요.');
      process.exitCode = result.status || 1;
      break;
    }
  }
}
