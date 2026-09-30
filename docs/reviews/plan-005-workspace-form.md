# plan-005-workspace-form 리뷰

## QA 근거

`npm run qa` 93 tests 및 lint/typecheck/build/base PASS, `UI_PORT=5174 npm run qa:smoke` PASS. 초점 수정 후 전체 `npm test` 96 tests와 frontend lint/typecheck/build, whitespace 검사 PASS.

실제 IAB CUA 1280×900/390×844: 프로젝트 생성, 장르 예문 적용·교체 취소·확정, 직접 작성, route 이동 후 draft 복원, 빈 입력 blur 오류, 미지원 설정, 준비 중 버튼과 overflow 없음 확인. 최종 수정 후 확정은 textarea, 취소는 opener 버튼으로 초점 복귀를 확인했다. 증빙 `/private/tmp/soundry-phase3-desktop.png`.

## 독립 판단

심사 backend_bootstrap이 QA 이후 전체 Phase 3 변경을 읽었다. backend 입력 검증·지원 범위, 공유 계약, frontend 응답 검증·stale 응답 차단, draft 격리, mock와 준비 중 표시의 일관성을 확인했다.

P2 1건: 예문 교체 확정의 textarea focus와 ModalDialog focus 복귀 경쟁. 단일 restoreDialogFocus 결정으로 수정하고 3개 회귀 테스트와 실제 CUA로 검증했다. 독립 재검토 PASS, 남은 P1/P2 blocker 없음.

## 잔여 범위

Phase 3은 작성 UI와 입력 계약이다. 실제 생성·저장·재생은 후속 Phase에서 연결한다. 원격 AI 성공이나 요청한 테스트곡 완료를 주장하지 않는다.
