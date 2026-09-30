# plan-005-workspace-form

## 목표와 범위

Phase 3: 프로젝트 workspace의 프롬프트와 Advanced Settings를 실제 provider capabilities 계약에 연결한다. Phase 2는 b5621b6로 main에 push했다. 별도 음원 제작 plan-004는 Fal 잔액 부족으로 active 상태이며 앱 구현은 계속한다.

- shared JSON ProviderSummary/Capabilities/GenerationInput 타입, frontend의 16개 장르 프리셋.
- backend GET /providers/current와 공급자별 입력 검증 계약. 현재 mock는 instrumental/variations만 지원한다.
- frontend prompt 1–4000자, variation1–4, mode/genre/mood/BPM/duration/seed 선택 설정, 지원하지 않는 항목 비활성화·이유 표시.
- 장르 프리셋은 프롬프트 예시이며 결과 장르를 분석한 값으로 표시하지 않는다.
- 생성 API와 job은 Phase 5에서 연결한다. 현 단계의 생성 버튼은 준비 중이며 성공을 위조하지 않는다. 작성한 내용을 후속 단계에서 그대로 제출할 수 있도록 composable로 분리한다.
- 로딩·오류·다시 시도, 기본값과 지원 범위 검증, keyboard/focus/mobile 화면 검증.

## 소유와 QA

지휘가 shared 및 backend provider 계약·root 문서를 소유하고 제작 agent가 frontend/**를 소유한다. 구현 후 lint/typecheck/test/build/base, temp-root smoke와 실제 CUA 1280/390px 입력 검증을 수행한다. 다른 agent가 QA 이후 독립 리뷰한다.

완료 시 completed·review mirror→commit→main 병합·push→merged branch 삭제하며 managed worktree를 다음 Phase에 재사용한다.

## Decision Log

- 2026-10-01: ProviderSummary에 generationEnabled와 안내문을 명시해 입력 가능·실제 생성 가능 여부를 구분한다. Phase 5 job API 준비 후 true로 전환한다.
- 2026-10-01: UI의 장르 프리셋은 16개이며 선택하면 음악적 콘셉트 프롬프트를 입력한다. Mock가 지원하지 않는 genre 설정을 몰래 전달하지 않는다.
- 2026-10-01: 입력 검증은 backend와 frontend 모두 수행한다. frontend는 UX를, backend는 최종 지원 범위·길이·형식 검증을 담당한다. 원격 호출과 비밀 키는 이번 단계에서 사용하지 않는다.

## QA / Blockers

- `npm run qa`: lint/typecheck, 93 tests, production build, base QA PASS.
- `UI_PORT=5174 npm run qa:smoke`: API/proxy/UI, 포트 충돌, Ctrl-C 뒤 두 포트 해제 PASS.
- 실제 IAB CUA: temp DB에서 프로젝트 생성 후 Hip-hop 예문 적용, 직접 작성, Funk 교체 취소, 보관함 이동·back 후 작성 복원, Jazz 교체 확정, 빈 prompt blur 오류를 확인했다.
- 1280×900 및 390×844에서 가로 넘침 없음. 세부 설정의 미지원 이유·비활성화, 생성 준비 중 상태 확인. 화면 증빙 `/private/tmp/soundry-phase3-desktop.png`.
- 독립 리뷰 P2 1건(예문 교체 확인 후 focus 경쟁)을 수정했다. 모달이 unmount 후 목적지를 한 번 정하며 취소는 기존 버튼으로 복귀한다. 실제 CUA에서 확정 TEXTAREA/취소 BUTTON을 확인했다.
- 수정 후 `npm test`: 96 tests PASS. frontend ESLint/typecheck/build, whitespace 검사 PASS. 독립 재검토 PASS, 남은 P1/P2 없음.
- 원격 호출·생성·재생은 이번 Phase 범위가 아니며 후속 구현을 계속한다.

## 완료

Phase 3 완료. Phase 4 MockProvider를 다음 계획에서 구현한다.
