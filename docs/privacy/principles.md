# 로컬 데이터와 외부 전송 경계

## 기본값

Soundry는 한 사용자의 loopback 웹앱이다. DB·음원·생성 이력은 설정한 로컬 data root에 저장한다. 로그인, 원격 hosting/storage, telemetry, analytics를 추가하지 않는다. local-first는 실제 AI 모델이 반드시 로컬에서 추론한다는 뜻이 아니다.

MockProvider에는 외부 호출이 없다. 실제 원격 공급자를 선택한 경우에만 backend에서 prompt/settings를 전송하고 UI에 전송 대상을 표시한다. 라이선스·보관 정책·요금은 해당 공급자 공식 문서를 Phase 8에서 확인한다. 지금은 특정 보관 기간이나 상업 사용 가능성을 주장하지 않는다.

## 키와 기록

- `.env`와 실제 data는 Git에서 제외한다. `.env.example`에는 비어 있는 예시 값만 둔다.
- API key는 backend 전용. frontend source, VITE 변수, URL, response, log에 포함하지 않는다.
- 로그는 job ID, 상태, duration, 정제된 오류 코드 위주이며 prompt 원문·공급자 응답 전체를 기본 출력하지 않는다.
- 실제 창작물·민감한 prompt를 fixture, 스크린샷, 문서에 복사하지 않는다. mock 음원은 자체 제작한다.

## Local API와 파일

loopback 바인딩과 Host/Origin allowlist를 사용한다. 서버 측 path containment·symlink 확인을 생략하지 않는다. 브라우저에서 임의 filesystem path나 다운로드 URL을 지정하는 API는 만들지 않는다. data root는 사용자 로컬 계정 권한 내에 두며 인증 서버로 확장하지 않는다.

원격 음원은 승인된 공급자 host와 redirects만 허용하고 시간/용량 한도를 둔다. 파일 내용을 검증한 후 공개한다. 로컬 삭제는 대상 이름과 범위를 확인하게 하고 진행 중 job과의 충돌을 차단한다. 백업은 서버 종료 후 data 전체 복사로 시작한다.
