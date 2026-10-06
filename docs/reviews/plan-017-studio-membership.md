# plan-017-studio-membership 리뷰

2026-10-06 QA 완료 후 심사 역할로 별도 소스 검토 PASS. 동일 주 에이전트가 QA 실행과 리뷰 판단을 순서대로 수행했으며 독립 subagent 리뷰를 수행했다고 주장하지 않는다.

## 결과와 검토 근거

요청한 A/B/C/D/E 다중 행 비트 편집·하단 행 추가와 랜딩, 회원·등급, 결제 연동 없는 상품 페이지, 등급별 생성량·관리자 무제한을 구현했다. 비트는 실제 프로젝트 Track을 참조하고 이동·구간·반복·볼륨·mute를 저장·미리듣기한다. 원본은 보존한다.

서버 세션, 프로젝트 소유권, 목록 pagination 전 소유자 필터와 오디오/다운로드 권한을 확인했다. Express와 같은 대소문자 정규화를 적용해 대문자 URL의 권한 우회를 회귀로 차단한다. 비밀번호·세션 원문은 공개 DTO에 없으며 첫 관리자 선정/기존 프로젝트 인계와 마지막 관리자 보호는 transaction으로 처리한다.

같은 요청 확인을 quota보다 먼저 수행하고 quota/insert를 한 IMMEDIATE transaction으로 묶는다. DB trigger가 usage ledger에 상태를 반영하고 프로젝트 삭제와 독립적으로 사용량을 보존한다. 실패/취소·월 경계·수동 등급 변경·관리자 무제한을 검사했다. 기존 CLI 공급자 한도와 작업 큐는 별개다.

클립의 프로젝트 소속·원본 길이·ID/개수/곡 길이를 서버에서 검증한다. 음원 디코딩 캐시는 현재 사용 원본만 유지하고 입력 중 과도한 숫자는 타임라인 생성과 오디오 메모리 할당을 막는다. 믹스 재생과 기존 플레이어를 상호 정지시키고 화면 해제 시 source/context/URL/listener를 정리한다. 편집 변경 시 이전 WAV 링크를 폐기해 오래된 믹스 다운로드를 막는다.

## 검증

- `SOUNDRY_PYTHON=/Users/taejungkim/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 npm run qa` exit 0. lint 0 warnings, strict 타입, 앱 43 files / 456 tests, 두 production build, base, 실제 Mock WAV, 음악 Node 16개·Python 21항목 PASS.
- `npm run qa:smoke` exit 0. API·UI proxy·포트 충돌·Ctrl-C 후 포트 해제 PASS.
- `git diff --check` PASS. 완료 문서·stage 후 base/diff 재확인한다.
- 임시 DB에서 실제 v1 migration·legacy 프로젝트 보존, 가입/세션/소유권·등급·usage ledger·클립 저장/재시작을 검증했다. 실제 사용자 DB를 수정하지 않았다.
- IAB 실제 회원가입 → 프로젝트 → Mock 2곡 생성 → A 60초 반복 + B/C/B와 D/E 배치, 하단 2행 추가, 저장·새로고침 복원, 미리듣기 재생 상태 PASS. C를 25→28초 드래그 이동, 길이를 8→6초 드래그 조절하고 저장했다. 관리자 화면의 마지막 관리자 해제 거부도 확인했다.
- 1280px 편집, 390px 편집/상품, 320px 랜딩에서 document scrollWidth가 viewport와 동일했다. 로컬 증빙 이미지는 `/private/tmp/soundry-plan017-beat.png`, `soundry-plan017-pricing.png`, `soundry-plan017-landing.png`이다.

## 검증 범위와 제한

첫 가입 전 기존 로컬 API는 호환 모드이며 첫 가입 이후 회원 세션을 강제한다. 최초 가입은 본인의 컴퓨터에서 수행한다. 계정 복구·삭제, 원격 회원 서비스와 결제·가격은 이번 요청 범위에 포함하지 않는다.

WAV encoder의 stereo PCM16 header·interleave·sample saturation 회귀와 브라우저 OfflineAudioContext 렌더링/Blob 링크 준비를 확인했다. IAB의 download/downloadMedia 이벤트가 timeout되어 실제 다운로드 파일과 음색 청취를 검증하지 못했다. 사용 가능한 Chrome 자동화 브라우저도 없었다. WAV가 디스크에 다운로드되었다고 기록하지 않는다. 실제 AI 생성은 호출하지 않았으며 본 QA의 음원은 자체 Mock fixture다.

삭제된 원본을 참조하는 편집본은 원본 없음으로 표시하고 해당 클립을 제거한 뒤 저장/재생해야 한다. 편집은 32행·128클립·600초, 믹스는 원본 8개·합계 600초 제한이다. 잔여 P1/P2는 없다.
