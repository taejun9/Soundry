# Phase별 구현 계획

**현재 gate: 2026-09-30 전체 구현 승인, Phase 1–7·9·10 Mock 흐름 검증, Phase 8 CLI 작곡·로컬 WAV E2E 검증 및 요청 20곡 제작·Downloads 패키징 완료.** 사용자 요청은 실제 화면 QA·UI/UX 개선 및 90–180초 테스트 음원 제작까지 포함한다. 실제 Phase마다 `docs/exec_plans/active/plan-NNN-<task>.md`를 만든다. 초기 설계는 plan-001-project-base, bootstrap은 plan-002다.

| Phase | 범위 | 사용자 확인 가능한 완료 기준 | 검증 |
|---|---|---|---|
| 1 Bootstrap | 두 npm workspace, Vue/Vite/Tailwind, Nest health, TS strict, root dev launcher, env example | 루트 npm install/dev로 loopback UI/API가 함께 시작하고 Ctrl-C로 함께 종료 | fresh install, health/proxy smoke, lint/typecheck/build; 포트 충돌 안내 |
| 2 SQLite / Projects | Drizzle/SQLite migration, StorageConfig, Project CRUD | 재시작 후 프로젝트 보존; 화면에 count/날짜 표시 | native driver 설치, DB/FK/migration, CRUD, temp data root, traversal |
| 3 Workspace UI | project route, prompt와 advanced settings, 기본 capabilities 계약 | prompt만으로 유효 입력 구성; 빈/로딩/오류 반응형 화면 | form 검증, keyboard, 1280px/390px 화면; 미구현 생성은 성공 표시 금지 |
| 4 MockProvider | 실제 자체 제작 fixture, provider adapter/contract | 네트워크와 키 없이 재생 가능한 sample bytes 반환 | WAV 독립 읽기·길이·크기, capabilities와 미지원 설정 거부 |
| 5 Job flow | persisted state + FIFO, polling, cancellation/retry, 저장 | 202 즉시 접수, 기존 UI 사용 가능, 새로고침·실패 설명 | idempotency, queue cap, restart, timeout, cancel race, 디스크/부분 batch 실패 |
| 6 Player | singleton audio, seek/volume, streaming Range | track 전환 시 동시에 한 곡, route 이동 재생 유지 | play promise race, pause/ended/error, Range/HEAD, 실제 browser 재생·탐색·종료 상태 |
| 7 History / Compare | generation 그룹, 재사용/재생성, track rename/delete | 과거 이력 보존, 여러 결과를 빠르게 전환·비교 | FK/파일 정합성, 두 generation 회귀, prompt 재사용 |
| 8 CLI composition | 기존 CLI 로그인, JSON 악보, 로컬 WAV 합성 | 실제 생성 결과를 로컬 저장·재생하고 전송 경계를 표시 | 공식 schema/기능/비용 확인, 키 누출 검사, timeout/취소, 한 번의 실제 생성 |
| 9 Library / Favorites | favorite persistence와 전역 목록 | project에 걸친 즐겨찾기 조회, 미상 metadata 표시 | 저장/조회/삭제 연동, 페이지 이동 |
| 10 Export / Polish / QA | 원본 다운로드, 오류/접근성/반응형 개선, README | 실행부터 생성·비교·재시작·다운로드까지 한 흐름 | byte/포맷 일치, clean install, Chrome/Safari smoke, 전체 QA 후 리뷰 |

## Phase 1 구체 범위

root package.json/workspaces와 package-lock.json, frontend/backend build 설정, shared JSON DTO 타입 경계, env 예제, UI shell, backend health, root dev script만 만든다. DB 실제 생성과 provider 구현은 다음 단계로 둔다.

Node 24 LTS/npm 단일 도구로 설치한다. 두 dev process 종료·오류 전달은 작은 Node launcher로 구현 가능성을 먼저 확인하고 별도 orchestration framework는 도입하지 않는다. stdout에 비밀 env를 출력하지 않는다. root dev 기본은 UI 5173 / API 3000이다. port 점유 시 종료·안내하고 자동 fallback은 하지 않는다. `UI_PORT`로 UI 포트를 명시할 수 있으며 backend Origin도 그 값으로 제한한다.

root에 실제로 동작하는 lint/typecheck/test/build/qa 명령을 구성하되 아직 테스트할 동작이 없는 경우 가짜 pass test를 만들지 않는다. 빈 smoke를 통과했다고 기능 완료를 주장하지 않는다.

## CLI 생성 정책

Phase 8은 Codex CLI 작곡과 로컬 WAV 합성으로 구현한다. 음악 입력 텍스트는 기존 ChatGPT 로그인 계정으로 전송하며 계정 한도가 적용된다. 앱에는 API 키를 받지 않고 유료 음악 API fallback을 두지 않는다. 실제 요청곡 생성·저장·화면 재생·원본 다운로드를 확인한 뒤 완료로 기록한다.

## 보고 및 완료 절차

각 Phase에서 구현 기능, 주요 변경 파일, 실제 실행 방법, 테스트 결과, 문제, 다음 범위를 한국어로 보고한다. 테스트는 변경된 동작의 실패 경계를 검증하며 QA 이후 별도 리뷰를 한다. 계획 완료와 리뷰 mirror를 남긴 뒤 승인된 git lifecycle로 병합한다. 다음 phase의 범위 변경은 새로운 plan의 Decision Log에 남긴다.

## 실행 기록 연결

Phase 1은 plan-002-bootstrap(10f2789 main push 완료), Phase 2는 plan-003-projects-storage다. 사용자 요청의 별도 테스트 음원 제작은 독립 worktree의 plan-004-test-music에서 병행한다. Phase 3 작성 화면은 plan-005-workspace-form이다. Phase 4 MockProvider는 plan-006-mock-provider이다. Phase 5 생성 흐름은 plan-007-job-flow이다. Phase 6 플레이어는 plan-008-player이다. Phase 7은 plan-009-history-tracks다. Phase 8의 과거 plan-010 유료 provider 변경은 main에 병합하지 않고 보존했으며, 사용자 요청에 따라 plan-013 CLI 방식으로 대체한다. Phase 9 보관함은 plan-011-library-favorites다. Phase 10 최종 검증과 사용 준비는 plan-012-release-polish이며 Mock 흐름 범위에서 완료했다. 20곡 전체 제작과 Downloads 패키징은 plan-004-test-music에서 완료했으며 [음원 제작 보고서](../quality/test-music-report.md)에 실제 파일과 청취 미수행 범위를 기록했다.

2026-10-01 사용자 요청으로 유료 Fal 방식을 제외했다. plan-013-cli-generation은 설치된 Codex CLI의 기존 ChatGPT 로그인으로 작곡하고 로컬에서 WAV를 렌더링한다. 이전 Fal key/잔액은 더 이상 진행 조건이 아니다. 실제 곡 생성·화면 QA를 새로운 완료 근거로 사용하며, 20곡의 원래 길이와 콘셉트 요구를 유지한다.

plan-013은 실제150초 CLI 곡 생성·로컬저장·IAB재생/탐색/일시정지·원본SHA/Range검사를 완료했다. 자동433 tests 및 adapter/renderer 독립리뷰PASS. 후속 plan014에서 끝마디 처리 보완과 전체 443개 테스트를 통과했다. plan004에서는 20곡 모두 150초로 완성하고 Downloads에 업로드용 WAV·설명·태그·원본 기록을 정리했다. 신호 검사·악보 구조 검토와 실제 화면 재생 검증을 수행했으며 음색 청취 평가는 수행하지 않았다.

## Phase 11 — 사용자 확장 요청 (2026-10-06)

plan-017-studio-membership: 다중 행 클립 비트 편집·행 추가·저장·미리듣기/WAV, 랜딩, 로컬 회원·등급·상품 안내·월 사용량·관리자 무제한. 이전 로그인·멀티트랙 제외 범위는 명시 사용자 요청으로 변경했다. 결제 연동과 원격 hosting은 포함하지 않는다. 기존 Phase QA 후 회원/소유권/usage ledger/편집 regression 및 실제 화면 QA를 수행한다.


plan-018-screen-music-qa: 전체 앱456·음악 Node18/Python23 및 lint/type/build/base/audio/smoke, 실제 IAB 회원/사용량/편집/원본과 Chrome 믹스 디스크 다운로드·Safari 한정 재생 smoke를 완료했다. 제작 도구를 연속 번호 1–20곡으로 일반화했고 추가 동부/서부 힙합 10곡은 모두 실제 120초 WAV로 Downloads에 패키징했다. [실행 근거와 청취 제한](../quality/plan-018-verification.md)을 따른다.
