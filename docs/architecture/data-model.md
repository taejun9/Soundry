# SQLite 데이터 모델

상태: Phase 2에서 Drizzle schema와 `backend/migrations/0000_initial.sql`을 구현했다. 프로젝트 CRUD와 Phase 5 생성 작업·원자적 트랙 저장·재시작 복구를 구현했다. 트랙 편집·삭제·즐겨찾기·재생과 전역 보관함 조회도 구현했다. DB 접근은 backend 한 프로세스가 소유한다. Phase 5부터 첫 DB 접근 전에 EXCLUSIVE 잠금을 획득해 두 번째 서버의 migration/recovery/파일 정리를 차단한다. 연결 종료는 worker 정리 이후에 수행한다. SQLite foreign key는 연결마다 명시적으로 활성화한다. schema migration SQL을 버전 관리하며 사용자 DB를 reset하는 명령을 기본 실행에 넣지 않는다.

## 테이블

필드 이름은 TypeScript 기준이며 실제 SQL은 snake_case로 통일한다. id는 UUID TEXT, timestamp는 UTC ISO 8601 TEXT다.

| 테이블 | 필드 | 의미/제약 |
|---|---|---|
| Project | id, name, createdAt, updatedAt | name은 trim 후 1–120자 |
| Generation | id, projectId, prompt, settingsJson | projectId FK; prompt 1–4000자; 설정은 검증 후 JSON snapshot |
| Generation | provider, model, status | provider 필수, model 미확정 시 NULL; status CHECK 5개 상태 |
| Generation | variationCount, requestKey | variationCount 1–4가 앱 기본 상한; requestKey는 project별 UNIQUE |
| Generation | sourceGenerationId | retry/regenerate의 원본, self FK ON DELETE SET NULL |
| Generation | errorCode, errorMessage | 실패 설명; 외부 응답·키·경로를 그대로 보관하지 않음 |
| Generation | createdAt, startedAt, finishedAt | queued는 startedAt NULL; 모든 terminal 상태에 finishedAt 기록 |
| Track | id, generationId, variationIndex, title | generationId FK; (generationId, variationIndex) UNIQUE; index 0부터 |
| Track | audioPath, mimeType, byteSize | audioPath UNIQUE 상대 경로; 실제 검증된 포맷/크기 |
| Track | durationSeconds, bpm, genre, mood, seed | provider/파일에서 확인한 값만, 미상이면 NULL |
| Track | provider, model, favorite, createdAt | 생성 당시 provenance; favorite INTEGER CHECK 0/1, 기본 0 |

settingsJson은 `mode`, `genre`, `mood`, `bpm`, `durationSeconds`, `seed`의 **요청값**을 담는다. 공급자가 실제 BPM/seed 등을 반환하지 않았다고 요청값을 Track의 실제 metadata에 복제하지 않는다. prompt는 Generation에서 join해 Track DTO에 넣고 projectId도 join으로 얻는다. UI는 요청 설정과 결과 metadata를 별도로 보여준다.

## 제약과 조회

- Project 삭제 → Generation → Track cascade. 파일 정리는 아래 삭제 절차로 별도 수행한다.
- `Generation(projectId, createdAt)`, `Track(generationId)`, `Track(favorite, createdAt)` 인덱스.
- requestKey UNIQUE(projectId, requestKey). 같은 key와 같은 canonical 입력은 기존 Generation 반환; 다른 입력은 409. submit 중 재전송은 동일 key, 명시적 재생성은 새 key를 쓴다.
- requestKey 검증과 enqueue는 service에서 처리한다. 재전송이 새 job을 중복 enqueue하지 않도록 DB insert 결과를 기준으로 한다.
- 이름은 중복 허용, 파일명은 UUID. SQL은 parameter binding을 사용한다.
- Project.updatedAt은 project rename, generation 생성/종료, track rename/favorite/delete 때 갱신한다. 재생·조회만으로 변경하지 않는다.
- Track 수는 JOIN/COUNT로 조회한다. favorite·prompt history 별도 테이블은 만들지 않는다.
- 재시도와 재생성은 새 Generation. terminal row를 queued로 되돌리지 않는다.

## 저장과 실패 보상

1. queued row를 먼저 commit하고 worker가 조건부 UPDATE로 processing을 점유한다.
2. provider 결과를 temp에 streaming 저장한다. 파일별 크기·media signature·빈 파일 여부와 예상 variation 수를 검사한다.
3. temp 파일을 최종 UUID 경로로 rename한다. 실패하면 이번 batch 파일만 정리하고 failed 처리한다.
4. 단일 짧은 DB transaction에서 아직 processing임을 확인하고 모든 Track insert + completed 전이를 반영한다. 취소가 이미 수락됐다면 insert하지 않는다.
5. commit 실패 또는 cancel race의 파일은 삭제 대상으로 정리한다. 다른 generation 파일은 만지지 않는다.
6. 프로세스가 3–4 사이에 중단되면 참조 없는 파일이 남을 수 있다. 시작 시 stale temp와 DB 미참조 UUID audio 파일만 확인해 정리한다. root 밖, symlink, 예상 형식 외 파일은 자동 삭제하지 않고 문제로 보고한다.

DB transaction 동안 provider 네트워크 요청이나 음원 streaming을 기다리지 않는다. 메타데이터 쿼리는 짧게 유지하고 대규모 오디오 분석은 추가하지 않는다.

## 삭제와 재시작

진행 중 generation이 있는 project 삭제는 409로 막는다. job 생성/삭제는 같은 짧은 transaction 경계에서 project 존재와 active 상태를 검증한다. UI는 삭제 대상을 명시적으로 확인받는다.

삭제는 DB transaction에서 대상 row를 지운 후 참조가 사라진 음원을 정리한다. 정리 실패는 cleanup 경고를 반환하고 다음 시작 시 orphan 정리를 재시도한다. 삭제 실패를 성공으로 숨기지 않는다. UI player가 대상 곡을 재생 중이면 먼저 정지한다.

재시작 시 queued/processing은 `failed / SERVER_RESTARTED`로 종료한다. 자동 재생성·원격 job 재연결·자동 과금은 하지 않는다. 누락된 원본 파일은 `AUDIO_MISSING`으로 알려주며 다른 파일을 만들어 성공 처리하지 않는다.

## Migration / 백업 검증

Phase 2에서 fresh DB migration, 기존 데이터 유지, FK/UNIQUE, requestKey 충돌, 재시작 전후 조회를 검사한다. 변경 전 서버를 끄고 data 전체를 백업한다. SQLite를 직접 수정하는 별도 UI, cloud sync, 실시간 백업 service는 MVP에 추가하지 않는다.
