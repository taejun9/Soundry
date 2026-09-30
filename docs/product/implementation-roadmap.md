# Phase별 구현 계획

**현재 gate: 초기 설계 승인 대기.** 아래 내용은 로드맵이며 구현 착수 승인이 아니다. 실제 Phase마다 `docs/exec_plans/active/plan-NNN-<task>.md`를 만든다. 이번 설계는 plan-001-project-base이고 다음 번호는 plan-002다.

| Phase | 범위 | 사용자 확인 가능한 완료 기준 | 검증 |
|---|---|---|---|
| 1 Bootstrap | 두 npm workspace, Vue/Vite/Tailwind, Nest health, TS strict, root dev launcher, env example | 루트 npm install/dev로 loopback UI/API가 함께 시작하고 Ctrl-C로 함께 종료 | fresh install, health/proxy smoke, lint/typecheck/build; 포트 충돌 안내 |
| 2 SQLite / Projects | Drizzle/SQLite migration, StorageConfig, Project CRUD | 재시작 후 프로젝트 보존; 화면에 count/날짜 표시 | native driver 설치, DB/FK/migration, CRUD, temp data root, traversal |
| 3 Workspace UI | project route, prompt와 advanced settings, 기본 capabilities 계약 | prompt만으로 유효 입력 구성; 빈/로딩/오류 반응형 화면 | form 검증, keyboard, 1280px/390px 화면; 미구현 생성은 성공 표시 금지 |
| 4 MockProvider | 실제 자체 제작 fixture, provider adapter/contract | 네트워크와 키 없이 재생 가능한 sample bytes 반환 | WAV 독립 읽기·길이·크기, capabilities와 미지원 설정 거부 |
| 5 Job flow | persisted state + FIFO, polling, cancellation/retry, 저장 | 202 즉시 접수, 기존 UI 사용 가능, 새로고침·실패 설명 | idempotency, queue cap, restart, timeout, cancel race, 디스크/부분 batch 실패 |
| 6 Player | singleton audio, seek/volume, streaming Range | track 전환 시 동시에 한 곡, route 이동 재생 유지 | play promise race, pause/ended/error, Range/HEAD, 실제 browser 청취 |
| 7 History / Compare | generation 그룹, 재사용/재생성, track rename/delete | 과거 이력 보존, 여러 결과를 빠르게 전환·비교 | FK/파일 정합성, 두 generation 회귀, prompt 재사용 |
| 8 Real provider | 하나의 실제 공급자, backend key, local 수집 | 실제 생성 결과를 로컬 저장·재생하고 전송 경계를 표시 | 공식 schema/기능/비용 확인, 키 누출 검사, timeout/취소, 한 번의 실제 생성 |
| 9 Library / Favorites | favorite persistence와 전역 목록 | project에 걸친 즐겨찾기 조회, 미상 metadata 표시 | 저장/조회/삭제 연동, 페이지 이동 |
| 10 Export / Polish / QA | 원본 다운로드, 오류/접근성/반응형 개선, README | 실행부터 생성·비교·재시작·다운로드까지 한 흐름 | byte/포맷 일치, clean install, Chrome/Safari smoke, 전체 QA 후 리뷰 |

## Phase 1 구체 범위

root package.json/workspaces와 package-lock.json, frontend/backend build 설정, shared JSON DTO 타입 경계, env 예제, UI shell, backend health, root dev script만 만든다. DB 실제 생성과 provider 구현은 다음 단계로 둔다.

Node 24 LTS/npm 단일 도구로 설치한다. 두 dev process 종료·오류 전달은 작은 Node launcher로 구현 가능성을 먼저 확인하고 별도 orchestration framework는 도입하지 않는다. stdout에 비밀 env를 출력하지 않는다. root dev는 UI 5173 / API 3000 사용, port 점유 시 임의 LAN/다른 포트로 바꾸지 않고 설명한다.

root에 실제로 동작하는 lint/typecheck/test/build/qa 명령을 구성하되 아직 테스트할 동작이 없는 경우 가짜 pass test를 만들지 않는다. 빈 smoke를 통과했다고 기능 완료를 주장하지 않는다.

## 실제 provider가 아직 없을 때

Phase 8은 명시적으로 보류하고 Mock workflow를 유지한다. 사용자 승인된 범위 내에서 독립적인 Phase 9–10을 진행할 수 있으나 실제 AI 작곡 완료로 보고하지 않는다. 키를 묻기 전에 후보의 기능·포맷·비용·데이터 전송을 정리한다. 지금 키를 받거나 결제/원격 요청을 실행하지 않는다.

## 보고 및 완료 절차

각 Phase에서 구현 기능, 주요 변경 파일, 실제 실행 방법, 테스트 결과, 문제, 다음 범위를 한국어로 보고한다. 테스트는 변경된 동작의 실패 경계를 검증하며 QA 이후 별도 리뷰를 한다. 계획 완료와 리뷰 mirror를 남긴 뒤 승인된 git lifecycle로 병합한다. 다음 phase의 범위 변경은 새로운 plan의 Decision Log에 남긴다.
