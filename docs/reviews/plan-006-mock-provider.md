# plan-006-mock-provider 리뷰

## QA 근거

- `npm run qa`: 116 tests, lint/typecheck/build/base와 qa:audio PASS.
- `UI_PORT=5174 npm run qa:smoke`: API/proxy/UI, 포트 충돌, Ctrl-C 해제 PASS.
- fixture 생성 소스로 저장된 bytes 재현, Python wave로 두 파일의 8초 stereo PCM16/44100Hz·peak0.560·RMS0.155/0.159·SHA256 확인.
- 임시 Git 저장소에서 정확한 허용 경로·용량 cap·symlink 거부·일반 사용자 WAV 차단 확인.
- compiled 앱의 cwd가 `/private/tmp`일 때 ProviderService 주입, HTTP summary, WAV stream size/hash 확인. 실제 IAB에서 고정 데모·프롬프트 미반영·외부 미전송 안내 확인.

## 독립 판단

심사 provider_research가 QA 이후 계약, 설정·DI, single-use stream, 호출 전/중간/소비 중 취소, 안전한 오류, 실제 metadata, fixture 및 harness 예외를 검토했다. 25 targeted tests, qa:audio, whitespace 검사를 직접 재실행했다. 최초 테스트 캐시 접근은 sandbox EPERM였고 승인된 실행에서 통과했다.

P1/P2 actionable blocker 없음. Phase 4 PASS.

## 잔여 범위

Job timeout, 전체 batch 저장·signature/size 검사, 재시작 복구, 화면 재생은 후속 단계다. 두 8초 고정 데모는 실제 AI 곡이나 사용자 요청의 테스트곡 20개를 대체하지 않는다.
