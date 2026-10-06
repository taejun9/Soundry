# 로컬 데이터와 외부 전송 경계

## 기본값

Soundry는 개인 컴퓨터에서 로컬 회원을 사용하는 loopback 웹앱이다. DB·음원·생성 이력은 설정한 로컬 data root에 저장한다. 2026-10-06 승인에 따라 로컬 회원·세션을 제공한다. 원격 hosting/storage, telemetry, analytics는 추가하지 않는다. local-first는 실제 AI 모델이 반드시 로컬에서 추론한다는 뜻이 아니다.

기본 CLI 공급자는 사용자가 생성 버튼을 눌렀을 때 음악 prompt/settings를 설치된 Codex CLI에 전달한다. CLI는 기존 ChatGPT 로그인으로 AI 작곡 요청을 전송하며 계정 정책과 한도가 적용된다. Soundry는 인증 파일을 읽거나 복사하지 않고 API키 환경변수를 child에 전달하지 않는다. 오디오 합성과 저장은 로컬이며 유료 음악 API fallback은 없다. MockProvider는 외부 호출이 없다. 보관 기간이나 상업 사용 가능성을 임의로 보장하지 않는다.

## 키와 기록

- `.env`와 실제 data는 Git에서 제외한다. `.env.example`에는 비어 있는 예시 값만 둔다.
- API key는 backend 전용. frontend source, VITE 변수, URL, response, log에 포함하지 않는다.
- 로그는 job ID, 상태, duration, 정제된 오류 코드 위주이며 prompt 원문·공급자 응답 전체를 기본 출력하지 않는다.
- 실제 창작물·민감한 prompt를 fixture, 스크린샷, 문서에 복사하지 않는다. mock 음원은 자체 제작한다.

## Local API와 파일

loopback 바인딩과 Host/Origin allowlist를 사용한다. 서버 측 path containment·symlink 확인을 생략하지 않는다. 브라우저에서 임의 filesystem path나 다운로드 URL을 지정하는 API는 만들지 않는다. data root는 사용자 로컬 계정 권한 내에 두며 외부 인증 서비스나 원격 공개 서버로 확장하지 않는다.

원격 음원은 승인된 공급자 host와 redirects만 허용하고 시간/용량 한도를 둔다. 파일 내용을 검증한 후 공개한다. 로컬 삭제는 대상 이름과 범위를 확인하게 하고 진행 중 job과의 충돌을 차단한다. 백업은 서버 종료 후 data 전체 복사로 시작한다.

## 로컬 회원과 오디오 편집

회원 이메일·이름·해시 비밀번호·세션 token hash는 같은 로컬 DB에 저장하고 외부로 전송하지 않는다. 세션 원문은 HttpOnly 쿠키만 사용하고 localStorage·URL·로그에 저장하지 않는다. 첫 가입자는 기존 데이터 소유자가 되므로 자신의 컴퓨터에서 최초 설정한다. 최초 가입 전 호환 API는 기존 loopback/Origin 경계를 유지한다. OS 저장 폴더에 접근할 수 있는 사람을 막는 암호화 보관소는 아니다.

미리듣기·WAV 믹스 내보내기는 브라우저에서 로컬 API 원본을 읽어 처리한다. 자동 AI 요청이나 외부 오디오 전송을 만들지 않는다. 회원별 앱 한도와 CLI 제공자 계정 한도는 서로 별개다.
