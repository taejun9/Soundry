# plan-011-library-favorites 리뷰

## QA 근거

최종 전체 QA 356 tests, lint/typecheck/build/base/audio PASS. 개발 서버 smoke도 PASS. 실제 IAB에서 두 프로젝트의 favorite 추가와 보관함 통합, 재생 중 favorite 해제 후 player 유지, 이름 변경과 player 동기화, 새로고침 보존, 삭제와 빈 상태를 확인했다. 1280×900/390×844 화면에서 가로 넘침 없음.

화면 근거는 `/private/tmp/soundry-phase9-library-desktop.png`, `/private/tmp/soundry-phase9-library-mobile.png`, `/private/tmp/soundry-phase9-empty-focus.png`다.

## 독립 리뷰

지휘는 직접 구현하지 않은 backend의 query/cursor/필터 순서/join DTO/삭제 및 재시작 계약을 검토했다. 관련 38 tests 독립 PASS, 추가 finding 없음.

심사 backend_bootstrap은 frontend에서 P2 두 건을 재현했다. 첫째, pending native disabled 또는 삭제된 dialog opener 때문에 초점이 BODY로 빠졌다. aria-disabled와 호출 guard, 제거 후 heading focus와 삭제 성공 시 preferred return으로 해결했다. 실제 IAB에서 Enter 키 경로 두 개 모두 H2#library-title 복귀를 확인했다.

둘째, PATCH 응답 유실 후 fresh GET으로 상태를 확인해도 오류가 남았다. 조회 시작 시 error version을 기록하고 해당 성공 응답으로 확인한 항목만 정리한다. 조회 도중 새로 생긴 오류와 실패/중단 응답은 보호한다. 독립 재리뷰 8 files / 66 tests PASS, 추가 P1/P2 없음.

## 잔여 범위

Phase 10 최종 실행·브라우저·문서 QA를 이어간다. 실제 Fal 생성 gate와 20곡은 별도 active 계획에서 기다리며, 이번 Mock 검증이 AI 작곡 완료를 뜻하지 않는다.
