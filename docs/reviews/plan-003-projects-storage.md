# plan-003-projects-storage 리뷰

## 결과와 독립성

2026-10-01 QA 후 교차 심사했다. frontend 구현 담당이 backend·공통 DTO·root smoke를 검토했고 backend 구현 담당이 frontend를 검토했다. 각자 구현한 파일은 자신의 심사 범위에서 제외했다. 수정 후 추가 blocker 없음.

## QA 근거

- native better-sqlite3 설치·SQLite3.53.4 메모리 연결, audit0.
- npm run qa: lint/typecheck/Vitest64개/build/base 통과.
- UI_PORT=5174 npm run qa:smoke: 격리 temp data root로 API/proxy/entry/포트 충돌/종료/포트 해제 통과.
- production HTTP 프로젝트 CRUD·앱 종료 시 DB close 통과.
- 실제 IAB: 공백 입력 거부, 생성→workspace, reload, rename, 서버 중단 오류 안내, 동일 DB 재시작 보존, 390px 가로 넘침 없음, 삭제 Escape 취소·focus 복귀·확인 후 빈 목록.

## Findings와 해결

- 화면 QA 발견: 프로젝트 COUNT 하위 SQL의 id 모호성으로 목록500. correlation을 projects.id로 명시해 실제 화면·통합 테스트 재검증.
- 심사 P2: NUL 이름이 SQLite CHECK 실패500을 일으킴. runtime에서400으로 거부하고 NUL 단독/선두/중간을 생성·이름변경 입력 회귀에 추가. 수정 후 Projects API15개/lint/typecheck/diff-check 통과, 발견 담당 재검토 승인.
- frontend의 stale 응답 차단, 중복 제출, 불확실 mutation 안내, 삭제 범위, native modal과 cursor 초기화에서 추가 문제 없음.

## 잔여 위험과 다음 단계

실제 job/음원 파일을 도입할 Phase5에는 동일 data root의 중복 backend와 startup orphan cleanup 간 경쟁을 단일 프로세스 소유로 보호한다. 프로젝트 count/FK/삭제 정합성은 임시 fixture로 검증했으며 실제 AI 생성·재생은 후속 Phase 범위다. 실제 사용자 DB·음원을 QA에 쓰지 않았다.

## Lifecycle

완료 계획과 리뷰를 포함해 main에 병합·push하고 merged branch만 삭제한다. managed worktree는 다음 Phase에 재사용한다.
