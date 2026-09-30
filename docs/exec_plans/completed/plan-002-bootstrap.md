# plan-002-bootstrap

## 목표와 승인

2026-09-30 사용자가 전체 기능 구현, 실제 화면 테스트, UI/UX 개선과 90–180초 테스트 음원 제작을 요청했다. 이를 설계 gate 이후 Phase 1–10 진행 승인으로 기록한다. 이번 계획은 Phase 1 bootstrap이며 이후 Phase마다 별도 계획을 만든다.

## 범위

- Node 24/npm 두 workspace, Vue/Vite/Tailwind와 Nest API, shared DTO.
- loopback dev launcher, health/proxy, 오류/포트/종료 처리.
- lint/typecheck/test/build/qa 명령과 실제 동작 검증.
- 설계 승인 상태와 README/QA 안내 갱신.
- 후속 실제 공급자와 테스트 장르 제작 범위 읽기 전용 조사.

## 단계와 완료 조건

1. frontend/backend/launcher를 파일 소유 범위를 분리해 구현한다.
2. fresh install, health/proxy, 포트 충돌, 종료, lint/typecheck/test/build와 base 검사를 실행한다.
3. QA 후 독립 리뷰와 수정 검증을 완료한다.
4. completed 이동, 리뷰 mirror, commit, main 병합·push, merged branch 삭제 순서를 따른다. worktree는 다음 Phase에 재사용한다.

## Decision Log

- 2026-09-30: 사용자의 명시적 구현 요청이 기존 설계 승인 대기를 해소했다. 기술 스택과 로컬 데이터 경계는 유지한다.
- 2026-09-30: 전체 goal을 Phase별 완료 gate로 나눠 진행한다. 원격 음원 생성은 공급자 schema/비용/전송 경계를 확인한 뒤 요청 범위 안에서 수행한다. 원격 자동 호출은 앱에 추가하지 않는다.
- 2026-09-30: “모든 장르”는 무한 분류가 아닌 앱의 장르 프리셋 전체를 테스트하는 것으로 구체화하며 후속 계획에 장르·콘셉트·곡 수를 명시한다. 별도로 그루비룸/천재노창 음악적 특성을 참고한 독창적 곡 각 2곡을 준비한다.

## 검증 기록

QA와 독립 리뷰를 완료했다. 아래 실행 결과와 완료 기록을 참조한다.

## Blockers

Phase 1 blocker는 모두 해소했다. 실제 공급자 키 설정과 생성 검증은 후속 Phase 8에서 처리한다.

## 실행 중 발견 및 해결 결정

- QA blocker: 첫 `npm run qa:smoke`가 5173 사용 중으로 실패했다. localhost 응답이 기존 React 앱인 것을 읽기 전용으로 확인했으며 종료하지 않았다.
- Decision: 기본 포트 5173/API 3000은 유지하되 명시적인 `UI_PORT` 설정을 허용한다. 자동 포트 이동은 계속 금지한다. 현재 테스트는 `UI_PORT=5174`로 실행하며 Vite/launcher/backend Origin allowlist가 같은 값을 검증한다. UI/API 포트 동일 값과 유효 범위 밖 값은 거부한다. 사용자의 기존 앱을 유지하면서 검증을 가능하게 하는 설정 변경이다.
- 첫 smoke는 startup 실패 후 cleanup assertion이 원래 실패를 덮는 것도 확인했다. startup 실패를 보존하고 실제 시작한 프로세스만 정리하도록 harness를 수정한다.

## QA 결과

- `npm ci`: lockfile 새 설치 성공, audit 0 vulnerabilities.
- `npm run qa`: ESLint, 두 workspace strict 타입 검사, Vitest 29개, 두 production build, 문서/저장 경계 모두 통과.
- `UI_PORT=5174 npm run qa:smoke`: API health/proxy/UI entry/3000 중복 실행 오류/SIGINT/두 포트 해제 통과.
- backend production start: health 200, 중복 실행 exit 1, SIGTERM 및 포트 해제 확인.
- CUA 실제 IAB: 1280×900 dashboard→workspace, 390×844 workspace→모바일 메뉴→library, 메뉴 자동 닫힘과 main focus, 390px 가로 넘침 없음, 콘솔 error/warn 없음.
- `git diff --check`: 통과. 기능 Phase의 지속 데이터·생성·재생 검증은 아직 대상이 아니다.
- QA 후 독립 리뷰를 요청했다. 리뷰 결과는 완료 기록에 반영한다.

- Review 보완: npm wrapper 종료와 하위 process group 종료를 구분한다. root launcher는 Node watch/Vite를 직접 실행하고 전체 group 종료를 확인한 후 cleanup timer를 해제한다. 실제 API/UI readiness와 연속 응답 실패를 확인해 watcher만 남는 실패를 종료한다. API_HOST 설정도 spawn 전에 검증한다.

## 완료 기록

2026-10-01 QA 후 독립 심사 통과. 시작 실패 전파 P2를 수정하고 잘못된 설정 즉시 종료, 실행 중 API 장애 후 UI 동시 종료, SIGSTOP된 UI 하위 프로세스 강제 정리를 독립 재현했다. 문서의 과거 상태 표현 2곳도 수정했다. 리뷰 mirror는 `docs/reviews/plan-002-bootstrap.md`다. main 병합·push 후 이 worktree는 다음 Phase에 재사용한다.
