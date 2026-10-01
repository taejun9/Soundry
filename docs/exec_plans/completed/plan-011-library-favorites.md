# plan-011-library-favorites

## 목표와 범위

Phase 9: 마음에 드는 음원을 프로젝트 전체에서 보관·조회한다. Phase 7은 7de8cc3으로 main push 완료다. Phase 8은 별도 관리형 worktree에서 구현하고 실제 생성 gate를 키/잔액 준비 후 검증한다. 로드맵의 독립 Phase 9 진행 규칙에 따라 이 작업을 진행한다.

- GET /tracks: favorite=true/false 선택 필터, projectId 선택 필터, createdAt/id cursor, 기본 30/최대 100. LibraryTrackSummary는 TrackSummary에 projectName을 추가한다. 모든 목록 항목에서 내부 경로/URL을 노출하지 않는다.
- 기존 PATCH favorite boolean을 사용한다. 프로젝트 이력 카드의 즐겨찾기 버튼과 전역 /library 목록, 재생·원본 다운로드·이름 변경·삭제를 연결한다.
- 보관함은 즐겨찾기만 기본 표시하고 프로젝트로 이동할 수 있다. 제목·프로젝트·길이·BPM·장르·생성일을 표시한다. 미상 metadata는 명확히 미확인으로 표시하며 요청 값을 실측 값으로 쓰지 않는다.
- 빈/로딩/오류/페이지 추가 상태, 중복 클릭 억제, 지연 응답과 route 이동 정리, 변경 후 목록/player 동기화, 모바일/키보드 접근성을 포함한다.

## 소유

- 지휘: shared/contracts.ts, 문서, 실제 UI QA와 통합.
- 제작 provider_research: 이 worktree의 backend/src/tracks/** 및 관련 API 테스트만. 다른 Phase 8 worktree 변경을 가져오지 않는다.
- 제작 frontend_bootstrap: 이 worktree의 frontend/**. 기존 dialog/audio/composable을 재사용한다.
- 심사 backend_bootstrap: QA 이후 frontend 독립 검토. 지휘가 직접 구현하지 않은 backend 목록 계약을 독립 검토한다.

## Decision Log

- 2026-10-01: 목록에 프로젝트 이름을 join하여 반환한다. 프론트에서 모든 프로젝트를 따로 순회하지 않는다. 기존 TrackDetail/TrackSummary 계약은 유지하고 LibraryTrackSummary만 확장한다.
- 2026-10-01: cursor는 불변 createdAt/id를 사용한다. favorite 변경은 프로젝트 수정일에 반영하되 음원 생성일은 바꾸지 않는다. 필터가 바뀌면 cursor를 초기화한다.
- 2026-10-01: 즐겨찾기 해제는 저장 확인 후 목록에서 제거하며 재생은 유지한다. 음원 삭제 확정만 현재 음원을 정지한다. 서버 응답 유실은 성공으로 단정하지 않고 새로고침 안내를 제공한다.

## 검증과 완료

여러 프로젝트·날짜 tie·필터·cursor·삭제 연동·재시작 보존, 즐겨찾기 중복 클릭과 실패/지연 응답, metadata 미상값, 보관함 route 재생 유지, 이름/삭제 동기화, 1280/390px UI 확인. 전체 QA → 독립 리뷰 → completed/review → main merge/push → branch 삭제 순서다.

## Blockers

실제 AI 제작은 plan-004/010에서 키/잔액 준비를 기다린다. 이 작업은 자체 제작 Mock 이력으로 검증 가능하다.

- 2026-10-01: GET /tracks의 favorite 생략은 전체, 명시 true/false는 상태 필터다. UUID 형식의 없는 projectId는 200 빈 목록이다. 미지/중복 query는 거부한다.

## 진행 근거

backend tracks 대상 96 tests, typecheck, ESLint, build와 diff check PASS. 여러 프로젝트·날짜 tie·필터·cursor·삭제된 기준점·수정·삭제·재시작·DTO 비공개 경계를 검증했다. frontend 통합 후 전체 QA와 독립 리뷰를 수행한다.

- 전체 QA 348 tests, lint/typecheck/build/base/audio PASS(리뷰 수정 전). root backend 독립 검토는 strict query, 필터 적용 순서, createdAt/id cursor, 삭제된 기준점, join DTO와 재시작 보존을 확인하고 관련 38 tests PASS, finding 없음.
- 실제 IAB: 프로젝트에서 favorite 추가 → 보관함에 두 프로젝트 동시 표시 → 재생 중 해제 후 player 유지 → 재생 중 이름 변경과 제목 동기화 → 새로고침 보존 → 보관함 음원 삭제 후 player 비우기/원본 이력 보존을 확인했다. 1280×900/390×844 모두 가로 넘침 없음. 스크린샷 `/private/tmp/soundry-phase9-library-desktop.png`, `/private/tmp/soundry-phase9-library-mobile.png`.
- 독립 리뷰와 실제 UI에서 P2 두 건을 발견했다. pending 버튼 disabled 및 제거된 dialog opener 때문에 키보드 초점이 BODY로 빠지는 문제, PATCH 응답 유실 후 새 목록으로 서버 상태를 확인해도 기존 favorite 오류가 남는 문제다. frontend 담당이 초점 복구와 버전별 오류 정리를 구현·검증 중이다.

## 최종 검증과 완료

- 최종 전체 QA: 37 files / 356 tests, lint/typecheck/build/base/audio PASS. dev smoke의 API/proxy/UI/포트 충돌/Ctrl-C 종료 PASS.
- P2 두 건 수정: pending favorite은 aria-disabled와 중복 호출 guard로 초점을 유지한다. 사라진 카드 또는 삭제 성공 dialog는 Library heading으로 복귀하고 사용자가 옮긴 초점을 빼앗지 않는다. 오류는 조회 시작 시 버전을 캡처해 확인된 최신 항목만 정리하고 이후 발생한 오류는 유지한다.
- 독립 재리뷰 66 tests PASS, 추가 P1/P2 없음. 실제 IAB Enter 키로 favorite 해제 및 삭제 후 H2#library-title 복귀를 재검증했다. `/private/tmp/soundry-phase9-empty-focus.png`에 빈 상태와 완료 안내도 기록했다.
- 문서 감사 결과 DB/제품/QA 범위를 현재 구현과 맞추고 README 첫 사용 흐름과 5174 접속 주소를 보완했다.
- Phase 9 범위 완료. 실제 90–180초 20곡 제작은 0곡이며 plan-004/010의 키/잔액 blocker를 유지한다.
