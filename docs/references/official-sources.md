# 공식 출처

확인일은 2026-09-30이다. 링크 내용은 초기 설계 근거이며 버전 고정이나 실행 검증을 대체하지 않는다. 기술 선택의 우선순위는 사용자 요구와 프로젝트 판단이다.

| 출처 | URL | 범위 | 확인일 | 사용 |
|---|---|---|---|---|
| Vue Quick Start | https://vuejs.org/guide/quick-start.html | Vue SFC/TypeScript/Vite | 2026-09-30 | SPA와 현재 Node 요구 확인 |
| Vite Guide | https://vite.dev/guide/ | 개발 서버/build/Node | 2026-09-30 | frontend build 도구 선택 |
| Tailwind Vite | https://tailwindcss.com/docs/installation/using-vite | Vite plugin | 2026-09-30 | Tailwind 4 통합 방식 |
| NestJS | https://docs.nestjs.com/ | TypeScript/backend/기본 Express | 2026-09-30 | controller/service 구조 |
| Node Releases | https://nodejs.org/en/about/previous-releases | Node LTS | 2026-09-30 | Node 24 LTS 기준 |
| npm Workspaces | https://docs.npmjs.com/cli/v11/using-npm/workspaces/ | 하나의 root에서 packages 관리 | 2026-09-30 | frontend/backend 두 workspace |
| Drizzle SQLite | https://orm.drizzle.team/docs/sqlite/get-started-sqlite | SQLite drivers | 2026-09-30 | better-sqlite3 adapter 가능; 현재 예제 RC 자동 채택 금지 |
| SQLite Foreign Keys | https://sqlite.org/foreignkeys.html | FK 활성화와 제약 | 2026-09-30 | 연결 시 FK 활성화와 cascade |
| MDN HTMLMediaElement | https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement | browser media API | 2026-09-30 | play/pause/seek/volume/events |
| MDN Range Requests | https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests | HTTP partial content | 2026-09-30 | stream seek/206/416 설계 |
| Vite Env | https://vite.dev/guide/env-and-mode | client env 노출 | 2026-09-30 | API key를 VITE 변수에 넣지 않음 |

## 근거 공백과 재확인

- 실제 생성은 설치된 Codex CLI의 ChatGPT 로그인으로 JSON 악보를 받고 로컬에서 WAV를 합성한다. 아래 CLI 공식 자료와 실제 검증을 근거로 사용하며, 과거 유료 음악 API 후보는 현재 실행 경로에서 제외한다.
- Phase 1 npm registry의 stable patch/peerDependencies를 확인하고 package-lock.json에 고정했다. 최신 TypeScript 7 대신 lint 도구의 지원 범위인 5.9.3을 사용한다. native SQLite driver와 브라우저 오디오 codec은 후속 Phase에서 검증한다.
- GrooveForge는 [별도 조사 기록](grooveforge.md)의 로컬 commit을 기준으로 한다.
- 법률·음원 이용 권리·상업적 사용 가능성에 대한 결론은 이 문서에서 내리지 않는다.

## CLI 작곡 전환 근거 — 2026-10-01

- [Codex 비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode): stdin 입력, JSON Schema 출력, 마지막 응답 파일, 기존 CLI 인증 재사용. 설치된 0.136.0의 실제 help 및 JSON 연결 probe로 사용 옵션을 확인했다.
- [Codex 인증](https://learn.chatgpt.com/docs/auth): ChatGPT 로그인과 API 키 과금 방식 구분. Soundry는 기존 ChatGPT 로그인만 사용하고 유료 API 키 방식은 허용하지 않는다.
- JSON 악보를 자체 renderer로 합성하는 방식과 악기/시간/연산량 제한은 Soundry의 설계 결정이다. Codex가 WAV를 직접 반환하는 기능이라고 주장하지 않는다.
- 이전 Fal 후보 조사와 잔액/키 조건은 사용자 요청으로 폐기했다. 현재 구현 근거는 plan-013이며 기존 역사 기록은 당시 상태를 설명한다.

## 업로드 파일 검증 — 2026-10-01

[SoundCloud Upload Requirements](https://help.soundcloud.com/hc/en-us/articles/360039171614-Upload-Requirements): 지원 WAV, stereo, 16-bit/44.1kHz 이상과 −0.5~−1dBFS 권장 headroom을 확인했다. plan-016의 기존20곡 파일 검사에 적용했으며 실제 업로드·계정 잔여량·권리 승인을 의미하지 않는다.
