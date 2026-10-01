# plan-013-cli-generation

## 목표

2026-10-01 사용자는 유료 음악 공급자를 제외하고 설치된 AI CLI를 호출하도록 변경했다. main 969446b의 앱·플레이어·저장 흐름에 CLI 작곡과 로컬 WAV 렌더링을 연결한다. 실제 90–180초 20곡 제작 목표도 유지한다.

## 범위와 소유

- 지휘: 계획·공통 계약 결정·통합·공식 자료·실제 CLI/API/화면 QA·문서·20곡 제작/전달.
- 제작 backend_bootstrap: CLI 실행/검증/취소, provider 등록·generation 연동과 관련 backend 테스트. renderer 파일은 제외한다.
- 제작 provider_research: backend/src/providers/composition/**의 엄격한 악보 JSON schema/validator, 로컬 오디오 renderer 및 독립 신호 테스트.
- 제작 frontend_bootstrap: frontend/**의 CLI 공급자 안내·설정·빈 상태·사용자 오류 흐름과 테스트.
- QA 이후 구현하지 않은 담당자에게 독립 리뷰를 배정한다.

## Decision Log

- Fal 유료 호출과 API key 설정은 제품 경로에서 제외한다. 이전 미병합 구현은 stash dc6243e37c91575c18d5b96a6141a48b8897acda에 tracked/untracked 전체를 보존했다. 이전 plan-010 worktree를 새 브랜치로 재사용하며 Fal 구현을 main에 병합하지 않는다.
- 설치된 Codex CLI 0.136.0과 Claude CLI 2.1.150을 확인했다. Codex는 ChatGPT 로그인 상태다. 사용자 CLI 선호 답변을 기다리되 추가 API key 없는 기존 로그인 Codex를 우선한다. 계정 한도가 적용되며 완전 무료/오프라인 추론으로 표시하지 않는다.
- CLI는 제한된 JSON 악보만 작성하고 오디오는 앱이 로컬에서 렌더링한다. 생성 코드·shell명령을 실행하지 않으며 기존 8초 Mock 복제나 단순 길이 늘이기를 실제 작곡으로 대체하지 않는다. 연주곡만 지원한다.
- stdin으로 음악 입력을 전달하고 저장된 CLI 로그인만 사용한다. API키 환경변수를 전달하지 않고 유료 음악 API fallback·자동 재시도·자동충전을 만들지 않는다. CLI 실패는 실패로 표시한다.
- CLI subprocess는 shell:false, 빈 임시 작업폴더, 읽기 전용 sandbox, 사용자 config/원격 tool 미사용, 유한 시간·출력 크기, 취소 시 프로세스 종료 및 임시 파일 정리를 갖춘다. backend만 실행하며 UI에서 실행 경로·명령을 받지 않는다.
- 자체 renderer는 구조·화성·멜로디·드럼·섹션별 전개를 악보에서 반영해 stereo 44.1kHz PCM WAV를 만든다. 결과 종류를 AI 작곡+로컬 합성으로 명확히 표시한다. 외부 sample이나 기존 음원은 사용하지 않는다.

- 실제 첫 곡은 요청한 20곡의 01번으로 생성한다. 기존 primary 서버를 종료한 뒤 같은 Soundry의 primary data 폴더를 명시해 단독 기동하며, 검증 후 main에서도 같은 데이터로 재생할 수 있게 한다. 기존 사용자 프로젝트는 지우지 않는다. DB schema 변경은 없다.

## QA와 완료

CLI 미설치/로그인/API키방식 거부, 제한된 schema의 잘못된 출력, timeout/취소/동시성/환경·경로·정보노출 경계를 검증한다. renderer의 길이·포맷·피크·무음·유한값·seed재현성과 서로 다른 악보의 결과 차이를 확인한다. 실제 CLI로 요청곡 하나를 생성해 로컬 저장→화면재생→원본다운로드를 확인한다. 전체QA와 독립리뷰 이후 completed/review/main병합·push·브랜치삭제를 진행한다. 20곡은 곡별90–180초·콘셉트와 실제 음악검토/포맷검사·패키징을 별도 plan-004와 연결한다.

## 실행 근거

- 실제 Codex CLI 연결 probe: ChatGPT 로그인, shell:false 환경·빈임시cwd·read-only·개인config및도구비활성·JSONschema·stdin·ephemeral로 exit0 및 유효 JSON. 실행된 item은 agent_message 하나이며 shell/tool 실행 없음. 별도 음악 API나 API 키를 사용하지 않았다. 이 확인은 곡 생성 gate와 구분한다.

- 전체 `npm run qa`: 41 files / 433 tests, lint/typecheck/build/base/audio PASS. 이후 실제 CLI 음악 및 화면 검증도 아래와 같이 수행했다.

- 실제 첫150초 요청은 CLI_INVALID_OUTPUT로 종료되어 저장 원본은 없다. 종료 작업의 상태·모바일 오류 안내를 확인했고 실패를 감추거나 Mock로 대체하지 않았다. 동일 콘셉트의 별도 수동 진단은 유효한 악보로 통과했다. 첫 실패 원본은 임시 폴더 정리로 남아 있지 않아 세부 원인을 확정하지 않았다.

- 실제 재검증:150초 stereo44.1kHz PCM16 WAV 생성·저장 성공. 다운로드와 저장파일 SHA256 일치, HTTP Range206 확인. full-scale0,긴무음경고0. 별도 진단의 유효 악보는 요청곡과 중복 집계하지 않았다.
- IAB320px: 길이89 입력의 오류/초점/자동세부열림, 실패와 입력재사용 확인창, 새 작업 완료, 재생시간증가,75초seek,일시정지 및 가로넘침없음 확인. 청취입력 기능이 없어 음악적품질 실제청취로 기록하지 않는다.
- 독립 리뷰:provider_research의 CLI adapter·generation/storage PASS, frontend_bootstrap의 composition renderer PASS 및42tests 독립재실행. 코드소유 밖에서 각각 검토했으며 추가P1/P2없음.
- 개발 smoke: 첫실행은기존서버점유로실패, 소유서버정상종료후API/proxy/UI/포트충돌/Ctrl-C포트해제PASS.
- 20곡 전체제작/Downloads는plan004에남으며 이계획의앱CLI전환범위와구분한다.

- 데스크톱1280×900 IAB에서 실제곡즐겨찾기추가→보관함카드/원본다운로드/기존플레이어상태유지확인. 테스트viewport는원복했다.

## 완료 판정

앱CLI전환·실제생성/화면/원본gate완료. 독립코드/문서리뷰PASS 이후completed로이동했다. main병합·push는이기록을포함한commit으로수행한다. 원래20곡목표는별도plan004로계속한다.
