# plan-007-job-flow

## 목표와 범위

Phase 5: 실제 MockProvider를 생성 작업 API·SQLite 이력·안전한 batch 파일 저장·작성 UI에 연결한다. Phase 4는 0ecad92로 main push 완료했다. 기존 managed worktree를 재사용한다.

- POST project generations: immutable canonical 입력, requestKey 멱등성, 202 접수/200 동일 요청/409 충돌, sourceGenerationId 소속 검증.
- GET project generations(cursor 페이지)/generation detail, POST cancel. 새 generation을 만드는 retry이며 원본 이력을 변경하지 않는다.
- DB queued→processing→completed/failed/cancelled, 전역 active 상한20, 동시1 FIFO, 실제 단계만 표시하고 progress=null.
- Mock timeout30초, 취소·timeout 후 늦은 결과 폐기, 전부 성공한 batch만 tracks 공개, 실패 보상.
- data root 단일 owner, bounded stream 저장(100MiB/track), PCM/IEEE-float WAV 실측 검증, temp→UUID audio rename, DB commit 실패 시 batch 정리.
- 재시작 queued/processing은 SERVER_RESTARTED 실패, 자동 재호출 없음. 알려진 stale temp·orphan audio만 정리.
- UI 제출/중복 방지/불확실한 응답 재확인/진행 중 polling/오프라인 재조회/취소/명시적 retry, 새로고침 후 완료 이력 표시.
- Player와 Range/다운로드는 Phase 6 이후다. 이번 track 카드에는 저장된 결과와 실제 길이만 표시하고 재생 성공을 주장하지 않는다.

## 소유

- 지휘: shared/contracts.ts, backend/src/storage/**, backend/src/config/storage-config*, backend/src/database/database.service.ts와 소유권 회귀, backend/src/main.ts, root 문서/harness.
- 제작 backend_bootstrap: backend/src/generations/**, backend/src/app.ts/app.module.ts/app.test.ts, backend/src/providers/provider.service*와 필요한 API 연동. storage 계약을 소비하며 파일 저장 구현은 수정하지 않는다.
- 제작 frontend_bootstrap: frontend/**. shared 계약 변경은 지휘에게 요청한다.
- 심사 provider_research: 전체 QA 이후 독립 리뷰. 파일 수정 없이 결과 보고.

## Decision Log

- 2026-10-01: SQLite EXCLUSIVE locking_mode를 첫 DB 접근 전에 적용하고 write lock을 확보한 뒤 migration/recovery/cleanup을 수행한다. 포트 바인딩 전 두 번째 서버가 다른 작업의 파일을 지우는 위험을 막는다. 잠금은 connection close/프로세스 종료로 해제한다. 공식 근거: https://www.sqlite.org/pragma.html#pragma_locking_mode 및 https://www.sqlite.org/wal.html (2026-10-01 확인).
- 2026-10-01: 현재 선택 공급자의 출력은 WAV뿐이다. StorageService는 실제 PCM/IEEE-float WAV만 검증·저장하며 MP3나 변환은 추가하지 않는다. 향후 다른 출력 포맷 도입은 해당 공급자 계획에서 검증기를 확장한다.
- 2026-10-01: backend의 Generation/Track JSON DTO와 StorageService 계약을 먼저 확정해 병렬 구현 충돌을 줄인다. source 요청 설정과 실제 파일/공급자 metadata는 분리한다.
- 2026-10-01: UI의 네트워크 불확실성은 job 실패가 아니다. 동일 입력 재확인에는 동일 requestKey를 사용하고 자동 POST 재시도는 하지 않는다. Retry는 사용자 동작으로 새 requestKey를 만든다.

## 검증과 완료

기존 전체 QA와 smoke, 입력/멱등성/queue cap/FIFO/취소 경쟁/timeout/부분 실패/저장 실패/재시작/단일 owner/경로·파일 경계 회귀를 수행한다. 실제 IAB에서 prompt→생성→완료 이력, 새로고침, 페이지 이동, 취소/재시도, 1280/390px을 검증한다. QA→독립 리뷰→completed/review mirror→commit→main 병합/push→merged branch 삭제, 다음 Phase에 worktree 재사용.

## QA / Blockers

- 저장·WAV·기존 경로·DB owner 회귀 29항목을 검증했다(최초 27 + 확장형PCM/미지원포맷 2 추가). 마지막 저장/owner subset 16 tests PASS. backend typecheck 및 소유 파일 ESLint PASS.
- 두 번째 Node 프로세스의 DB 접근은 DATA_DIRECTORY_IN_USE로 거부하고 in-flight audio/temp를 보존했다. owner 종료 후 재열기에서 알려진 orphan/stale만 정리됨을 확인했다.
- 처음 프로세스 간 테스트는 tsx의 backend tsconfig를 찾지 못해 실패했으며 cwd를 backend로 지정해 수정했다. 제품 동작 실패를 우회하지 않았다.
- production HTTP smoke에서 202→동일key200→4개 실제8초 WAV→재시작 동일이력→project삭제와파일정리 PASS.
- backend 전체139 tests 중 기존 fixture Buffer deep-equality 검사가 15초 한도를 초과했다. 동일한 byte equality를 native Buffer.equals로 바꿔 불필요한 대용량 순회를 제거하고 재실행한다. mock-provider.test.ts 비교 2곳은 backend 담당의 소유 범위를 확장했다.
- 수정 후 `npm run qa`: 190 tests, lint/typecheck/build/base/audio PASS. `UI_PORT=5174 npm run qa:smoke` PASS. backend140, frontend50 tests.
- 실제 IAB CUA: 테스트용 느린 Mock(10초)에서 생성→취소→새작업retry→route이동·복귀→완료2곡 확인. 두 번째 진행 작업 도중 임시서버를 중단하고 DB processing 잔류를 확인했다. UI는 연결 문제를 job 실패와 구분해 backoff 재조회했고, 기본서버 재시작 시 자동 생성 없이 SERVER_RESTARTED 실패로 복구했다. 명시retry 후 완료, 새로고침에서 총4개이력/4곡보존을 확인했다.
- 1280×900와390×844의 가로넘침 없음. 화면 증빙 `/private/tmp/soundry-phase5-desktop.png`, `/private/tmp/soundry-phase5-mobile.png`. 테스트 서버 2개 모두 종료했다.
- 독립 backend job/API 리뷰 PASS: 43 tests 재실행 및 실제WAV4개 완료UPDATE강제실패→tracks0/audio0/temp0→다음FIFO정상완료를 확인했다.
- frontend 독립리뷰 P2: 완료poll 이후 늦은 cancel 네트워크오류가 화면에남는경합. 수정과 독립 재리뷰 PASS. storage 독립리뷰 P2도 아래 근거로 수정·재검토했다. 실제 AI 및 요청 테스트곡 20개는 Fal 잔액·앱 키 준비 이후 별도 검증하며 완료 수는 아직 0이다.

- 독립 frontend P2 수정 후 재리뷰 PASS: cancel 응답보다 완료/실패/취소 poll이 먼저 확정된 경우 늦은 오류를 무시한다. 4개 회귀를 포함한 lifecycle13 tests 독립 PASS.
- 독립 storage P2: 생성 temp 폴더가 symlink로 교체될 때 외부 동명 파일을 cleanup이 삭제할 수 있었다. 폴더·파일 dev/ino 소유권을 검사·이동·정리 시 재확인하고 검사 FD도 대조한다. 소유권이 바뀌면 삭제를 건너뛰고 정리 경고를 남긴다. throw/abort/finish symlink 교체3개와 regular part 교체1개 보존 회귀 추가, 저장/config/WAV31 tests·typecheck·ESLint PASS.

- 최종 `npm run qa`: 198 tests와 lint/typecheck/build/base/audio PASS. `UI_PORT=5174 npm run qa:smoke`에서 API/proxy/UI·포트충돌·Ctrl-C 이후 해제 PASS.
- storage 독립 재리뷰도 PASS: 31 tests 재실행, 경로교체 시 외부파일 보존 확인. backend/frontend/storage 모두 남은 P1/P2 없음. Phase 5 완료.
