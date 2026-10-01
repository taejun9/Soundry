# plan-009-history-tracks 리뷰

## QA 근거

최종 전체 QA 294 tests, lint/typecheck/build/base/audio와 개발 서버 smoke PASS. 실제 IAB에서 초안 덮어쓰기 확인/취소, sourceGenerationId를 가진 새 requestKey 생성, 재생 중 이름 변경, 삭제 취소/확정과 player 정리, 마지막 음원 삭제 후 프롬프트 보존, 복사/결과 이동과 새로고침을 확인했다. 1280×900 및 390×844 화면과 모바일 편집 창은 가로 넘침 없이 표시되었다.

화면 근거: `/private/tmp/soundry-phase7-desktop.png`, `/private/tmp/soundry-phase7-mobile.png`, `/private/tmp/soundry-phase7-mobile-rename.png`.

## 독립 리뷰

지휘는 직접 구현하지 않은 backend의 입력 검증, 공개 DTO, 원본 UUID/bytes 불변, 수정·삭제 transaction, 파일 실패 보상, Generation 보존과 cursor를 검토했다. 관련 16 tests 독립 PASS, finding 없음.

심사 backend_bootstrap은 frontend에서 P2 두 건을 재현했다. 첫 페이지 갱신 실패 후 nextCursor로 다음 페이지를 재시도하는 문제와, 편집이 backoff 목록 조회를 중단할 때 재예약이 끊기는 문제다. frontend 담당이 첫 페이지 refresh 재시도와 changeTrack의 schedule 복구를 적용하고 지연 응답/이름 변경/삭제 회귀를 추가했다. 독립 재검증 33 tests PASS, 추가 P1/P2 없음. Phase 7 PASS.

## 남은 범위

전역 보관함/즐겨찾기 UI는 Phase 9다. 실제 생성·음질·90–180초 테스트 음원은 별도 계획에서 키/잔액 준비를 기다린다. 이번 8초 Mock 검증은 실제 AI 작곡 완료를 뜻하지 않는다.
