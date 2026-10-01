# plan-016 전체 검증 기록

2026-10-01–02, 관리형 `codex/plan-016-quality-release`에서 수행했다. 실제 사용자 데이터와 임시 QA 저장소를 분리했다. 자동 검사, 실제 화면 조작, 파일 검사를 구분하며 이전 검증 결과를 이번 실행으로 집계하지 않는다.

## 코드 설명과 변경 범위

직접 작성한 기존 코드 140개(frontend 68개, backend 61개, harness 8개, shared 1개, 루트 설정 2개) 전부와 신규 QA launcher 1개에 한국어 주석을 보강했다. 모듈·함수 계약, 비동기 응답·취소 경쟁, 파일·인증 경계, UI 접근성, 렌더러, 검증 도구와 테스트 의도를 설명한다. JSON·lockfile·오디오·빌드 산출물은 문법과 재현성을 위해 주석 대상에서 제외한다. TS/JS printer와 Vue/CSS/HTML/SQL 주석 제거 비교로 앱 실행 코드가 기존과 같음을 확인했다.

동작 변경은 QA 도구 범위다. root `qa`에 `qa:music`를 연결해 누락되던 Node 배치 16개와 Python 음원 21항목도 실행한다. NumPy가 있는 Python 3.10 이상을 `SOUNDRY_PYTHON`으로 지정할 수 있고 의존성이 없으면 실패한다. 실제 90초 PCM24 변환은 유지하고 20곡 metadata 구성 검사의 변환/복사에만 대역을 제한해 임시 저장량을 줄였다. 대역 없는 원본 유지 패키지 검사는 그대로 수행한다.

## 자동 검사

- 기준 전체 QA: lint·strict typecheck·41 files/443 tests·frontend/backend build·base·Mock WAV PASS.
- 프런트엔드 주석 후: lint 0 warnings, 타입 검사, 18 files/132 tests, diff PASS.
- 백엔드 주석 후: lint 0 warnings, 타입 검사, fixture 재현, diff PASS.
- 음악 도구: Node 16개, Python 21항목 PASS. 의존성 미설치 경계는 exit 1 안내 확인.
- 개발 실행 smoke: `UI_PORT=5174 npm run qa:smoke` PASS. API·Vite proxy·UI entry·포트 충돌·Ctrl-C 이후 두 포트 해제 확인.
- 전체 통합 중 `database-owner` child 준비와 `cli-runner` 후손 종료 검사의 고정 시간 가정으로 2개 실패를 발견했다. ready handshake 및 bounded 종료 확인으로 안정화한 뒤 전체 재실행 PASS: 41 files/443 tests, Node 16 tests, Python 21항목, lint·typecheck·build·base·Mock WAV 모두 exit 0. 운영 앱 동작은 변경하지 않았다.

## 실제 IAB 화면

임시 프로젝트를 UI로 만들고, 종료·재시작 후 확인한 뒤 UI로 삭제했다. 기존 20곡 프로젝트와 Downloads 파일은 수정하지 않았다.

| 기능 | 실제 관찰 |
| --- | --- |
| 첫 사용·생성 | 빈 화면과 프로젝트 이름 필수 오류, 새 프로젝트 생성 후 작업 공간 이동 |
| 프로젝트 관리 | 한글 이름 변경과 곡 수 유지, 삭제 범위·곡 수 확인, Escape 취소 시 삭제 버튼으로 초점 복귀, 최종 삭제 후 빈 화면 |
| 작성 | 빈 prompt 차단, Jazz 예문 적용, 곡 수 2→1 선택, 입력 재사용 시 덮어쓰기 확인, 자동 생성 없이 입력 복원 |
| CLI 범위 | 실제 공급자 ready 상태와 전송 안내, 보컬 미지원, 길이 89초 제출 시 90–180초 오류와 생성 차단 |
| 생성 | Mock 2곡 완료, 다음 작업 즉시 취소, 취소 이력 유지, 명시적 재시도로 새 1곡 작업, 완료 입력 재생성으로 별도 이력 추가 |
| 이력 | 완료/취소·곡 수·요청 공급자 표시, 프롬프트 복사 성공 안내, 재사용·재생성에서 원래 이력 보존 |
| 플레이어 | 재생 상태, 시간 진행, 음량 80→1%, pause, 키보드 seek, 실제150초 곡 End 탐색 후 재생 완료, 페이지 이동 후 선택 곡·상태 유지 |
| 음원 관리 | 이름 변경 시 카드·플레이어·보관함 동기화, 재생 중 음원 삭제 시 플레이어 비움, 같은 generation의 다른 곡과 이력 유지 |
| 보관함 | favorite 저장·목록 반영, BPM/장르 미확인 표시, 해제 후 빈 목록·초점 복귀·원본과 재생 유지 |
| 다운로드 | UI 다운로드 링크를 통한 실제 저장, 한글 파일명, SHA256가 원본 fixture와 일치. 기능 QA의 8초 파일은 Downloads에서 QA 임시 파일로 이동 |
| 재시작 | 서버 정상 종료·동일 QA 저장소 재시작 후 프로젝트 이름과 3곡 보존 |
| 오류·복구 | 서버 중단 후 목록 갱신 오류와 재시도 안내, 서버 복귀 후 정상 목록, 삭제한 프로젝트 주소의 찾을 수 없음 화면 |
| 반응형·입력 방식 | 320×844 보관함/작업 공간의 scrollWidth=320, 모바일 메뉴 열기·페이지 선택 시 닫힘, 1280×900 프로젝트 카드·하단 플레이어 표시. 키보드 Enter/방향키/Escape 및 마우스 삭제창 열기 확인 |

음원 다운로드 대기 중 Vite 주석 변경에 따른 재시작과 브라우저 연결 오류가 있었다. 이전 탭은 브라우저 오류 페이지 상태가 되어 재사용할 수 없어 새 IAB 탭에서 정상 UI를 확인했고, 문서화된 링크 다운로드 기능으로 파일 저장·해시를 검증했다. 이 중단을 앱 다운로드 성공으로 기록하지 않는다.

로컬 화면 근거는 `/private/tmp/soundry-plan016-desktop.png`, `/private/tmp/soundry-plan016-mobile.png`다. 임시 QA 서버를 종료하고 사용자 앱을 primary main 및 기존 CLI 데이터로 복구했다. 기존 보관함의 Raincheck Avenue 2:30 표시·재생·일시 정지도 확인했다.

모든 조합·실패 상태를 수작업으로 재현한 것은 아니다. queue overflow, 디스크 저장 실패, 응답 유실, process cancellation race, pagination, Range/HEAD 등의 세부 경계는 자동 회귀 근거를 따른다. 별도 Chrome/Safari의 이번 재검증과 20곡 전곡 청취는 수행하지 않았다. 실제 AI 생성은 기존 plan-013/014·20곡 산출물을 재검증했으며 이번 요청에서 원격 작곡을 추가 호출하지 않았다.

## 업로드용 음원 전수 검사

`Downloads/Soundry_SoundCloud_2026-10-01`의 기존 83개 파일을 읽기 전용으로 검사했다. 20곡 모두 150초(2:30), 총50분, stereo PCM16/44.1kHz, 곡당26,460,044 bytes다. 앱 원본·배치 원본·Provenance·Upload_WAV 네 경로의 SHA가 일치하고 서로 다른20개 SHA, 독립 inode·nlink1을 확인했다. metadata TXT/CSV/JSON·요청 계획·provenance·신호 검사와 실제 파일이 일치한다. 누락·미완료·신호 경고·full-scale frames는0, 최대 저레벨 구간0.5초다.

sample peak는 −1.075127~−0.915209dBFS다. [SoundCloud 공식 업로드 안내](https://help.soundcloud.com/hc/en-us/articles/360039171614-Upload-Requirements)를 2026-10-01 확인했으며 지원 WAV·stereo·16bit/44.1kHz 이상·권장 headroom 조건에 맞는 파일이다. 계정 업로드 잔여량은 확인하지 않았고 외부 업로드는 수행하지 않았다. 청취·true peak·LUFS 평가는 별도로 남긴다.

상세 로컬 근거: `/private/tmp/soundry-plan016-package-audit.json`. 새 파일을 만들거나 길이를 늘려 원래 결과를 바꾸지 않고 기존 완성곡을 이번 요청의 산출물로 보존한다.
