# plan-019 검증 근거

확인일: 2026-10-09 Asia/Seoul. 보컬·음색용 모델은 사용자 후속 요청으로 제외하고 작곡 기능을 검증했다.

## 자동 QA

로컬 캐시의 fresh `npm ci --offline` 후 bundled Python을 `SOUNDRY_PYTHON`으로 지정해 `npm run qa`를 실행했다. 앱48 files/474 tests, lint0 warnings, frontend/backend strict typecheck·production build, base 구조/링크/비공개 파일 경계, Mock WAV2개, 음악 Node18/Python23 PASS. 새 migration으로 기존2개 기대값 테스트가 실패한 부분을3개로 갱신하고 전체 QA를 통과했다. QA 이후 리뷰에서 발견한 rights object/tags null 입력도400으로 거부하도록 보완한 뒤 lint/typecheck/build와 관련4 files/16 tests를 다시 통과했다.

회원 간 지식 read/update/delete·관리자 격리, 가입 전401, enum/type/본문 제한, 원격 동의, relevance·한국어/영문 검색·후반 passage·상한6/1000, 낮은 평가 avoid/3점 제외, 실제90초 PCM 저장·악보 보존·참고digest·idempotency·삭제 FK NULL, 평가1개 upsert·곡 구조 활용·원시선율 미전송·재시작 유지·미검증 출력 미저장을 확인했다. 기존 v1 데이터 유지 migration과 회원/사용량/생성 회귀를 포함한다.

Ollama 테스트는 실제 loopback HTTP 대역이다. cloud.disabled 확인, remote alias/모델 부재, 임의 endpoint/model 거부, format schema/stream=false, 바이트 상한·redirect 거부·출력 오류·타임아웃·취소를 검증했다. 실제 Gemma 모델 호출 성공으로 기록하지 않는다.

MIDI는 독립 binary reader로 type1/480PPQ/tempo/marker/track count/드럼channel10, transpose/종료 clipping, note-off 순서와 겹친 같은음 gate 유지 검증을 통과했다.

## 개발 smoke

기존 primary backend는 과거 plan018 QA data를 사용하고 있었다. 정상 종료 후 data 전체를 `data/plan019-backup-before-migration`으로 APFS clone 백업했다. 백업schema2, 진행 중 generation0을 확인했다. 사용 중인 기존 UI5174는 유지했다. `UI_PORT=5175 npm run qa:smoke`에서 임시 data root의 API·Vite proxy·UI entry·포트 충돌·Ctrl-C 후 포트 해제를 확인했다. 초기5174 smoke는 기존 UI 점유로 실패했으며5175 재실행에서PASS했다.

## 실제 화면

임시 데이터/가상회원/자작 악보 runner로 IAB 로그인 → 프로젝트 생성 → 지식 작성 및 동의 default=false → 지식 저장 → 실제 생성 접수/90초 WAV 저장 → 참고 지식1개 표시 → 청취 평가 저장 → 저장한 지식2개 → 새로고침 뒤 평가 복원을 확인했다. 원격 CLI/계정/음악 모델은 호출하지 않았다. DB·renderer·HTTP·Vue UI는 실제 구현이다.

390px에서 작곡 노트의1열 배치·평가·JSON/MIDI 버튼을 확인했고 document scrollWidth=viewport390으로 가로 넘침0을 확인했다. 임시 viewport를 원복했다. 지식 영구 삭제 UI는 실행하지 않았으며 API 삭제/권한/참조 정리 회귀로 검증했다.

MIDI 링크의 실제 디스크 다운로드 `Downloads/soundry-composition.mid`를 확인하고 독립 파일 검사로 MThd/type1/5tracks/480PPQ/8053bytes를 읽었다. 다운로드 뒤 MIDI 겹침 개선은 별도 binary 회귀로 검증했다. JSON은 HTTP 반환 및 화면 버튼을 확인했으며 Blob JSON의 실제 디스크 저장은 별도 확인하지 않았다. 실제 DAW import, 실제 Gemma 추론, 새 원격 CLI 생성, RAG 전후 음악적 청취 비교, 판매 품질/이용 권리 평가는 수행하지 않았다.

## 데이터와 실행 정리

실제 회원 정보·세션·DB·WAV·다운로드와 화면 자료는 Git에 넣지 않는다. QA 서버/프런트는 종료하고 기존 primary backend를 기존 data root·UI5174·CLI 설정으로 복원한다. 사용 중인 프로세스가 없는 관리형 worktree만 완료 후 archive한다. 최종 Git/실행 상태는 완료 보고로 확인한다.
