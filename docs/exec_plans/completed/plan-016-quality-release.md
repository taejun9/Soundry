# plan-016-quality-release

## 목표와 범위

사용자 요청에 따라 전체 lint·test를 clean으로 만들고 직접 작성한 코드 전반에 상세한 한국어 설명 주석을 보강한다. 실제 브라우저에서 프로젝트·생성·이력·플레이어·보관함·다운로드의 정상/오류 흐름을 확인한다. 기존 제작 음원 20곡과 Downloads 패키지가 실제로 90–180초 및 업로드 가능한 WAV인지 전수 재검증하고 누락이 있으면 복구한다.

## 소유와 절차

- 지휘: 계획·통합, 최종 QA, 실제 화면 검증, 문서·Git lifecycle.
- 제작 frontend: frontend 전체 파일 주석과 해당 범위에서 발견한 결함.
- 제작 backend: backend 전체 파일 주석과 해당 범위에서 발견한 결함.
- 검증 harness: harness, shared 및 root 코드 설정의 주석; 기존 음악 패키지 읽기 전용 검사.
- 파일 소유권을 지키고 다른 작업의 변경을 되돌리지 않는다. QA 후 별도 심사 담당에게 독립 리뷰를 요청한다.
- 관리형 worktree /Users/taejungkim/.codex/worktrees/plan-016-quality-release/Soundry 및 codex/plan-016-quality-release에서 작업한다.

## Decision Log

- 2026-10-01: 코드 주석은 모듈 목적·계약, 함수/상태 전이, 경계·비동기 경쟁·검증 이유를 설명한다. 테스트는 시나리오와 fixture 의도를 설명한다. 생성 산출물·lockfile·JSON에는 비표준 주석을 넣지 않고 인접 코드/문서로 설명한다.
- 2026-10-01: 기존 20곡은 전곡 150초 및 업로드 패키징 완료 기록이 있다. 실제 SHA/포맷/길이/메타데이터를 재검증해 유효하면 보존·재사용하고 불필요한 원격 작곡이나 중복 대용량 복사를 하지 않는다. Mock 8초 fixture는 기능 QA 전용이며 전달 음원에 포함하지 않는다.
- 2026-10-01: UI 검증은 별도 임시 데이터 루트에서 수행해 기존 사용자 프로젝트·음원을 보호한다. 실제 CLI 곡은 기존 결과의 재생/다운로드를 확인하고 작곡 기능은 기존 E2E 근거와 현재 provider 상태를 구분해 기록한다. 추가 실제 생성 필요성은 검증 중 판단한다.
- 2026-10-01: 의존성은 동일 저장소 primary의 ignored node_modules만 재사용할 수 있다. 외부 프로젝트 의존성·인증 파일은 읽거나 복사하지 않는다.

- 2026-10-01: baseline 전체 QA 41 files/443 tests PASS. 기본 QA에서 누락된 Node 배치 16개와 Python 음원 21항목을 qa:music으로 통합한다. Python 검증의 20곡 패키지 구성 검사는 검증된 PCM24 결과를 독립 COW 복사하는 테스트 대역으로 분리해 디스크 사용을 줄인다. 실제 90초 PCM24 변환·신호/경계 검증과 원본 유지 20곡 독립 파일 검증은 유지하며 테스트 대역 범위를 명시한다. 현재 여유 약395MiB, 사용자 파일은 정리하지 않는다.

- 2026-10-02: 기본 python3에 NumPy가 없음을 확인했다. 자동 설치 대신 SOUNDRY_PYTHON을 지원하는 QA launcher를 추가하며, 이 환경은 Codex 앱 도구가 확인한 bundled Python을 명시한다. 실행 전 의존성을 확인하고 검사 실패를 성공으로 건너뛰지 않는다.

- 2026-10-02: 최종 전체 QA에서 database-owner subprocess import/lock timeout과 cli-runner 손자 회수 30ms 가정이 실패했다. 프로덕션 동작을 바꾸지 않고 DB child ready→probe handshake로 초기화와 lock 검증을 분리한다. CLI fixture는 손자 signal handler 설치 뒤 ready를 기록하고 실제 ESRCH까지 bounded polling한다. 고정 sleep이나 검증 생략으로 실패를 숨기지 않는다.

## 검증 계획

1. baseline lint/typecheck/tests 및 누락된 harness 테스트를 확인한다.
2. 상세 주석과 발견한 결함을 반영한다. 결함 수정은 실패 경계를 재현하는 테스트로 검증한다.
3. npm run qa, npm run qa:smoke, 음악 도구 테스트, git diff --check를 실행한다.
4. 실제 화면에서 프로젝트 생성/수정/삭제, 입력 검증/설정, 생성/취소/재시도/재생성, 이력·프롬프트 재사용, 재생/탐색/음량/종료/페이지 이동, 음원 수정/즐겨찾기/삭제/다운로드, 반응형·키보드·재시작 보존을 검증한다. 재현하지 못한 상태는 명시한다.
5. Downloads 20곡 전수 길이·WAV·SHA·메타데이터·원본 보존 상태를 검사한다. 실제 SoundCloud 업로드는 요청 범위 밖이며 로컬 파일만 준비한다.
6. QA 후 독립 리뷰 → completed 이동·리뷰 mirror → main 병합·push → merged branch 삭제 → managed worktree archive 순으로 완료한다.

## 진행 기록

- 2026-10-01: main이 clean이고 현재 대화에 active worktree가 없음을 확인했다. 관리형 worktree를 생성하고 전용 브랜치에서 이 계획을 먼저 작성했다.

## 최종 검증 기록

- 2026-10-02: 최종 전체 `SOUNDRY_PYTHON=<NumPy 지원 Python> npm run qa` exit0. 앱41files/443tests + Node16개 + Python21항목, lint0warnings·strict typecheck·두 build·base·Mock WAV PASS. 개발smoke API/proxy/UI/충돌/Ctrl-C 포트해제 PASS. 로컬 로그는 /private/tmp/soundry-plan016-qa-final.log 및 soundry-plan016-smoke.log.
- 2026-10-02: 실제 IAB 주요 사용자 흐름과 320px/1280px 표시 QA 완료. 임시 프로젝트는 UI로 삭제했고 원래 CLI 앱/20곡 데이터로 복구했다. [전체 검증 기록](../../quality/plan-016-verification.md)에 실제 재현과 자동 검사·미수행 범위를 구분했다.
- 2026-10-02: Downloads 기존83파일·20곡 전수PASS. 모두150초, stereoPCM16/44.1kHz, 네경로 SHA일치·고유SHA20개·신호경고0. /private/tmp/soundry-plan016-package-audit.json 근거. 원격재작곡·SoundCloud업로드·전곡청취는 수행하지 않았다.

## Blockers

없음. 최종 전체 QA·실제 화면·음원 파일 검증 및 독립 리뷰 PASS.

## 독립 리뷰와 완료 판정

- frontend_comments(심사): backend 61파일 독립 검토 PASS. 운영 코드/스키마 불변, 두 테스트 오류·PID 소멸 검증 유지, 집중11tests 및 기존DB migration 보존 검증 PASS.
- backend_comments(심사): frontend/harness/shared/root QA 변경 독립 검토 PASS. TS/JS/CSS/HTML 정규화·Vue production compile·Python 운영 도구 AST 비교로 동작 불변을 확인했다. QA 대역은 명시된 구성 검사만 적용되며 실제 변환/원본 보존 검증 유지.
- harness_audio(심사 보조): 요청 범위·주석 대상 기존140개 전수·신규launcher1개·설정예시2개·문서와 음원 근거 확인, P1/P2 없음. 자신이 작성한 harness 구현 판단은 다른 심사 담당이 수행했다.
- 비차단 지적은 모두 반영했다: 오래된 설계/API키/timeout 안내, 기록일·Python 전제·복구시제, smoke fetch 오류 주석.
- 실행 계획을 completed로 이동하고 동일 basename 리뷰 mirror 후 main 병합·push·병합 브랜치 삭제·관리형worktree archive를 진행한다.
