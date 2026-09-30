# plan-003-projects-storage

## 목표

Phase 2: 프로젝트 생성·목록·열기·이름 변경·삭제, 재시작 후 보존을 실제 화면과 SQLite에 연결한다. 2026-09-30 전체 구현 승인 범위이며 Phase 1은 10f2789로 main push를 완료했다.

## 범위와 소유

- 제작 backend: backend/**의 StorageConfig, SQLite/Drizzle migration/schema, Project CRUD와 실패 경계 테스트.
- 제작 frontend: frontend/**의 프로젝트 API client/목록·생성·수정·삭제·route 연결과 반응형 UX.
- 지휘: shared/contracts.ts, root install/lock, 문서·QA·실제 화면 검증.
- 심사: QA 이후 읽기 전용 독립 리뷰.

## 구현과 검증

1. native better-sqlite3 설치 및 temp data root에서 migration/FK/UNIQUE와 CRUD 검증.
2. data root는 repository 기준 resolve, 지정 root/하위 DB·audio·temp symlink 탈출 거부. 경로·키·원본 오류를 API에서 노출하지 않는다.
3. 전체 schema는 설계의 세 테이블을 migration으로 생성해 후속 job/track을 수용하되 아직 생성 기능은 노출하지 않는다.
4. Project name trim 1–120, UUID validation, unknown fields reject, 목록 updatedAt/id cursor/limit, trackCount, 진행 중 삭제409를 구현한다.
5. 화면 loading/empty/error/retry, accessible modal, 이름·영향 범위 삭제 확인, 서버 기준 새로고침을 구현한다.
6. QA lint/typecheck/test/build/base, 실제 브라우저 CRUD/새로고침/재시작/1280·390px 검증 후 독립 리뷰.
7. completed·review mirror→commit→main 병합·push→merged branch 삭제. 같은 worktree 재사용.

## Decision Log

- 2026-10-01: worktree plan-002-bootstrap을 재사용하고 새 phase branch에서 작업한다. 실행 중 프로세스는 없다.
- 2026-10-01: 테스트 data root는 /private/tmp의 작업별 새 디렉터리로 고립한다. 기본 사용자 data를 검증에 쓰지 않는다.
- 2026-10-01: Project DTO는 id/name/createdAt/updatedAt/trackCount; cursor 계약은 API 설계와 동일하다. 이름 변경/삭제는 서버 성공 후 반영한다.

## QA 기록

아래 실행 결과를 참조한다.

## Blockers

Phase 2 blocker 없음. 교차 독립 리뷰의 NUL 입력 오류를 수정하고 재검토를 통과했다.

- 2026-10-01: root smoke도 매 실행 mkdtemp data root를 강제하고 서버 종료가 확인된 뒤 그 디렉터리만 정리한다. 실행자의 실제 데이터와 MUSIC_PROVIDER 설정을 검증으로 변경하지 않는다.

## 실제 QA 결과

- native better-sqlite3 설치 성공, 메모리 DB SQLite 3.53.4 연결 확인, npm audit 0.
- `npm run qa`: lint/strict 타입/Vitest 64개/두 build/base 통과. `UI_PORT=5174 npm run qa:smoke` 및 diff-check 통과.
- backend production HTTP CRUD 및 SQLite close 검증 통과.
- CUA 실제 화면: 공백 이름 거부, 생성→workspace, 새로고침 보존, 이름 변경, 서버 중단 안내, 같은 DB 재시작 후 보존, 모바일390px 가로 넘침 없음, 삭제 Escape 취소와 버튼 focus 복귀, 삭제 후 빈 목록. 임시 QA 프로젝트만 사용했다.
- 화면 QA에서 목록500 발견: Drizzle 하위 COUNT SQL의 ambiguous id를 명시적 projects.id로 수정해 해결했다. 이후 실제 화면·64개 테스트를 재검증했다.
- QA 이후 frontend 담당은 backend를, backend 담당은 frontend를 교차 독립 리뷰했다. 본인이 구현한 파일은 심사 범위에서 제외한다.
- Phase 5 후속 점검: 실제 job 파일을 저장하기 전에 동일 data root의 중복 backend와 startup orphan cleanup의 경쟁을 막는 단일 프로세스 소유 보호가 필요하다. 현재 Phase 2에는 실제 생성 파일 쓰기가 없다.

- 독립 리뷰 P2 수정: 이름에 NUL 문자가 있으면 SQLite 길이 CHECK에서500이 나던 입력을 runtime400으로 거부한다. 생성·이름변경 모두 NUL 단독/선두/중간 회귀 입력을 추가했다.

## 완료 기록

2026-10-01 구현·QA·실제 화면 검증·교차 독립 리뷰 완료. NUL 수정 후 Projects API 15개 테스트, 전체 lint/typecheck 및 diff-check를 재검증했다. 두 심사 담당이 추가 blocker 없음을 확인했다. completed 계획과 리뷰 mirror를 포함해 main 병합·push하고 이 worktree는 Phase 3에 재사용한다.
