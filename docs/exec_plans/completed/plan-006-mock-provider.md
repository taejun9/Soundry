# plan-006-mock-provider

## 목표와 범위

Phase 4: 네트워크·키 없이 실제 WAV bytes를 반환하는 MockProvider를 구현한다. Phase 3은 c53a4a8로 main push 완료했다. 기존 managed worktree를 재사용한다.

- backend 전용 provider 계약, MockProvider, 고정된 backend provider 설정과 capabilities 응답.
- 자체 제작 짧은 PCM WAV 두 개, 재현 가능한 생성 소스와 권리·용량·SHA256 근거.
- fixture는 외부 음원·샘플을 사용하지 않는 수학적 합성 원곡이며 사용자 요청의 90–180초 테스트곡을 대신하지 않는다.
- variationCount 1–4에 맞춰 두 fixture를 순환하고 실제 duration만 metadata로 반환한다. prompt/seed/BPM이 결과를 바꿨다고 주장하지 않는다.
- 생성 지연/실패/취소/stream 소비 취소를 주입 가능한 경계에서 검증한다. 테스트용 디버그 설정을 앱 UI에 노출하지 않는다.
- Job API와 생성 버튼 활성화는 다음 Phase 5에서 구현한다.

## 소유와 검증

제작 backend_bootstrap은 backend/src/providers/**와 backend/fixtures/audio/**, 필요한 app 주입 파일을 소유한다. 지휘는 harness fixture 허용 규칙·독립 WAV 검증·root 문서를 소유한다. frontend 변경은 필요하지 않다. QA 완료 후 provider_research가 독립 리뷰한다.

자동 QA는 provider 계약/취소/재현성 테스트, Python wave로 독립 WAV 읽기·길이·음량 검사, lint/typecheck/build/base/smoke다. UI에 변화가 있으면 실제 화면에서도 확인한다. 완료 후 completed·review mirror→commit→main 병합·push→branch 삭제, worktree는 Phase 5에 재사용한다.

## Decision Log

- 2026-10-01: Git의 음원 금지 예외를 `backend/fixtures/audio/demo-01.wav`, `demo-02.wav` 두 경로에 한정한다. 각각 2 MiB 이하, 합계 4 MiB 이하로 제한하고 재현 소스·해시를 함께 둔다. 사용자 음원 경로의 기본 차단은 유지한다.
- 2026-10-01: 현재 공급자 설정은 mock만 허용한다. 다른 값은 명확한 설정 오류로 시작을 거부하며 mock로 조용히 대체하지 않는다. 실제 fal은 Phase 8에서 별도 adapter를 도입한다.
- 2026-10-01: Mock는 instrumental, maxVariations 4, 추가 설정 없음, 외부 취소 없음이다. 생성 결과는 fixture이며 provider notice에 명시한다.

## QA / Blockers

- 독립 Python wave QA: 두 파일 모두 8.00초 stereo PCM16/44100Hz, peak 0.560, RMS 0.155/0.159, manifest SHA256 PASS.
- 임시 Git 저장소에서 정확한 fixture 경로만 허용, 일반 사용자 WAV 차단, 2 MiB 초과 및 symlink 거부 PASS.
- `npm run qa`: 116 tests, lint/typecheck/build/base, fixture 재현 및 독립 WAV QA PASS.
- `UI_PORT=5174 npm run qa:smoke`: API/proxy/UI, 포트 충돌, Ctrl-C 이후 포트 해제 PASS.
- compiled 앱을 cwd `/private/tmp`에서 실행해 ProviderService 주입·HTTP summary와 실제 두 stream의 길이/해시 확인 PASS. 임시 앱/데이터 정리 완료.
- 실제 IAB 작성 화면에서 고정 데모·프롬프트 미반영·외부 미전송·생성 준비 중 안내를 확인했다.
- 독립 리뷰 PASS. provider_research가 취소/오류·config DI·fixture 허용 경계를 검토하고 25 targeted tests와 qa:audio를 직접 재실행했다. P1/P2 blocker 없음. 요청한 실제 테스트곡 제작은 별도 plan-004에서 Fal 잔액 부족으로 대기 중이다.

## 완료

Phase 4 완료. Phase 5에서 job 저장·취소·재시작·입력 제출 UI를 연결한다.
