# plan-016-quality-release 리뷰

2026-10-02 QA 이후 독립 리뷰 PASS. 사용자 요청의 전체 테스트·린트 정리, 코드 전반의 상세 주석, 실제 화면 검증과 90–180초 업로드 음원 준비를 확인했다.

## 변경과 검증

기존 주석 가능 코드 140개 전체와 신규 launcher 1개, 설정 예시 2개를 설명했다. 모듈·함수 계약, 상태/경쟁·인증·저장 경계, 오디오 렌더링, 접근성·스타일과 테스트 의도를 한국어로 보강했다. JSON·lockfile·생성물은 제외했다. 운영 앱 실행 코드와 스키마는 변경하지 않았다.

기본 `npm run qa`에 음악 Node/Python 검사를 포함했다. `SOUNDRY_PYTHON`으로 NumPy가 준비된 Python을 선택할 수 있고 의존성 오류를 숨기거나 자동 설치하지 않는다. 실제 90초 PCM24 변환과 실제20곡 원본 유지 복사를 보존하고 metadata 구성 단계에만 복제 대역을 사용해 임시 저장량을 줄였다.

전체 QA에서 발견한 2개 프로세스 테스트의 고정 시간 가정을 고쳤다. DB child의 import 준비와 잠금 시도를 IPC로 분리하고 CLI fixture의 종료 신호 handler 준비와 실제 PID 소멸을 확인한다. 기존 오류 종류·DB sentinel·프로세스 종료 검증을 유지했다.

최종 `SOUNDRY_PYTHON=<NumPy 지원 Python> npm run qa` exit 0: 앱 41 files/443 tests, 음악 Node16 tests, Python21항목, lint0 warnings, strict typecheck, frontend/backend build, base, Mock WAV 재현·독립 검사 PASS. `UI_PORT=5174 npm run qa:smoke`의 API/proxy/UI/포트 충돌/Ctrl-C 두 포트 해제 PASS. 마지막 문서·공백 검사도 통과했다.

## 독립 판단

- frontend_comments가 backend 61파일을 검토했다. TS/JS 정규화와 SQL 스키마 비교로 실행 불변을 확인했고, 집중 11tests·기존 migration hash와 DB 데이터 보존·소유 child 정리도 확인했다. actionable finding 없음.
- backend_comments가 frontend/harness/shared/root QA를 검토했다. 59개 TS/JS/CSS/HTML 정규화, Vue16개 production compile, Python 운영 도구3개 AST 비교를 수행했다. launcher 오류 전파·대역 적용 범위·원본 불변 검증 적절, P1/P2 없음.
- harness_audio는 구현과 분리해 문서·요청 범위·140개 기존 소스 누락 없음·최종 로그 수치·음원 파일 근거를 보조 검토했다. 오래된 설계 안내와 시제·기록일 등 P3 사항은 반영했다. 자신의 harness 구현은 별도 심사 담당의 판단을 따랐다.

## 화면과 전달 음원

[전체 검증 기록](../quality/plan-016-verification.md)에 실제 IAB 기능·320px/1280px 표시, 연결 중단·재시작, 키보드·마우스, 생성/취소/재시도/재생성, 음원·보관함·다운로드·삭제 근거를 기록했다. 다운로드 WAV는 fixture와 SHA256가 같고, 재시작 후 프로젝트와 음원이 보존된다. 임시 QA 프로젝트를 UI로 정리하고 기존 CLI 앱·20곡 데이터로 복구했다.

Downloads의 기존83개 파일·20곡 전수 PASS. 전곡150초(2:30), stereo PCM16/44.1kHz, 고유SHA20개, 앱/배치/Provenance/Upload_WAV의 SHA 일치와 독립 파일 확인, 신호 경고0. 이미 완성된 곡을 보존·재검증했으며 추가 원격 작곡이나 중복 파일 생성 없이 전달할 수 있다.

이번 실행의 native Chrome/Safari·Windows·모든 화면 상태 조합과 전곡 실제 청취·true peak/LUFS 평가는 수행하지 않았다. 세부 오류 경계는 자동 회귀 근거를 따른다. 실제 SoundCloud 업로드나 계정 업로드 한도 확인은 하지 않았다. 실제 생성 근거는 기존 CLI E2E와 이번에 검사한20곡이며 Mock8초 기능검사를 전달 음원으로 집계하지 않는다.
