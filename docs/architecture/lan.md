# 같은 네트워크에서 Windows로 테스트

사용자가 승인한 신뢰하는 내부 LAN에서만 production 웹 화면을 제공한다. API는 127.0.0.1:3000, Gemma는 127.0.0.1:8089를 유지한다. LAN gateway는 맥북의 지정한 RFC1918 IPv4와 기존 UI 포트에만 bind한다. 외부 hostname/Origin, 경로 탈출, source tree, 비밀 파일은 제공하지 않는다. 기존 회원 인증·소유권과 same-site HttpOnly 세션을 유지한다. 첫 회원 설정이 없는 앱은 LAN을 시작하지 않는다.

맥북 `.env`에 SOUNDRY_LAN_HOST를 현재 내부 IPv4로, UI_PORT를 화면 포트로 지정한다. SOUNDRY_DATA_DIR는 기존 사용자 데이터 위치를 유지한다. 실제 환경 파일은 Git에 넣지 않는다. localhost 화면과 내부 IP 화면은 서로 다른 쿠키를 사용하므로 Windows에서 기존 계정으로 다시 로그인한다.

```sh
npm run build
npm run dev
```

다른 맥북 터미널에서 다음 명령으로 LAN 화면을 시작한다. 먼저 실행한 API에도 동일한 LAN host/port 설정이 적용되어야 한다.

```sh
npm run lan
```

Windows 브라우저에서 출력된 http 주소를 연다. IPv4가 변경되면 `.env`를 갱신하고 API와 LAN gateway를 다시 시작한다. 맥북이 깨어 있고 두 프로세스가 실행 중이어야 한다. production build 이후 코드가 바뀌면 다시 build한다.

연결 실패 시 Windows PowerShell의 `Test-NetConnection <맥북의 내부 IPv4> -Port <UI 포트>`로 TCP 도달을 확인한다. 같은 공유기의 게스트 네트워크·AP isolation은 기기 간 연결을 막을 수 있다. macOS 방화벽이 활성화되어 연결을 차단한다면 Node의 수신 연결 허용 여부를 확인한다. 전체 방화벽을 끄거나 공유기 포트 포워딩을 추가하지 않는다.

HTTP는 신뢰하는 LAN 테스트용이며 TLS를 제공하지 않는다. 외부 인터넷 서비스 또는 불특정 사용자의 접근을 위한 배포 설계로 사용하지 않는다. 현재 실행 검사와 Windows 실제 조작은 품질 기록에서 구분한다.
