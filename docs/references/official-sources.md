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

## 회원·로컬 오디오 편집 — 2026-10-06

- [Node Crypto](https://nodejs.org/api/crypto.html): scrypt, randomBytes, timingSafeEqual. salt·token/비밀번호 처리에 적용한다.
- [MDN AudioBufferSourceNode.start](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start): scheduling의 when/offset/duration. 구간 겹침과 미리듣기 구현에 적용한다.
- 등급별 10/100/500곡, 한국 시간 월 단위, 관리자 무제한과 첫 가입자 데이터 인계는 Soundry 제품 결정이다.

## plan-018 업로드 포맷 재확인 — 2026-10-06

[SoundCloud Upload Requirements](https://help.soundcloud.com/hc/en-us/articles/360039171614-Upload-Requirements)를 다시 확인했다. WAV lossless, stereo, 16-bit/44.1kHz 이상과 -0.5~-1dBFS headroom 권장값을 이번 10곡 파일 검사 기준으로 사용한다. 앱의 월 등급 정책과 SoundCloud 계정의 업로드 잔여량은 별개이며 이번 작업은 파일 준비 범위다.

## 작곡 LLM/RAG — 2026-10-09

- [Google Gemma 개요](https://ai.google.dev/gemma/docs/core): open weights와 모델/추론 메모리 구분. 특정 크기의 작곡 품질 우위는 추론하지 않는다.
- [Ollama 구조화 출력](https://docs.ollama.com/capabilities/structured-outputs), [Generate API](https://docs.ollama.com/api/generate): format schema, stream=false, 응답과 옵션 계약.
- [Ollama FAQ](https://docs.ollama.com/faq): OLLAMA_NO_CLOUD=1과 서버 재시작. [공식 client 소스](https://github.com/ollama/ollama/blob/main/api/client.go)와 [공식 types](https://github.com/ollama/ollama/blob/main/api/types.go): /api/status의 cloud.disabled, /api/show의 capabilities/model_info/remote_host 계약. experimental 상태 API 미지원 시 fail-closed는 Soundry 결정이다.
- [RAG 원논문](https://arxiv.org/abs/2005.11401): 검색 기억을 추론에 결합하는 근거. 음악적 품질 향상이나 자체 LLM 훈련의 근거가 아니다.
- [ACE-Step 공식 저장소](https://github.com/ace-step/ACE-Step-1.5)는 초기 보컬·음색 가능성 조사에만 참고했다. 사용자 후속 지시로 음악 모델 도입은 제외했으며 의존성/모델을 설치하지 않았다.

## llama.cpp — 2026-10-09

[공식server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md): /health, /v1/models, /v1/chat/completions, response_format JSON schema와thinking 제어. 사용자가구동한로컬Gemma 서버의health200/단일모델/context32768을직접확인했다. 제한된loopback·소유권/RAG·출력검증·타임아웃은Soundry의설계결정이다.

## Live 제작 흐름과 Web Audio — 2026-10-09

[공식 조사·기능별 지도](ableton-live-research.md)에 Live12 매뉴얼/비교표와장르검증범위를정리했다. UI공간배치의참고이며Ableton코드/번들통합이나기기동등성근거가아니다. [MDN OfflineAudioContext](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext), [StereoPannerNode](https://developer.mozilla.org/en-US/docs/Web/API/StereoPannerNode), [linearRampToValueAtTime](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/linearRampToValueAtTime)를공통preview/export·pan·fade scheduling에적용한다. [SoundCloud 업로드 조건](https://help.soundcloud.com/hc/en-us/articles/360039171614-Upload-Requirements)의lossless/stereo/16bit44.1kHz이상/headroom을재확인했다. 실제업로드나음악성승인은포함하지않는다.
