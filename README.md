# Soundry

개인 컴퓨터에서 음악을 생성하고, 듣고 비교하고, 프로젝트별로 관리하는 로컬 AI Music Studio입니다.

**현재: 프로젝트 관리와 로컬 저장 구현, Phase 2 완료.** 프로젝트를 만들고 열고 이름을 바꾸고 삭제할 수 있으며 재시작 후에도 보존됩니다. 음악 생성·재생은 후속 Phase에서 추가합니다. 전체 구현은 2026-09-30 승인되었습니다.

## 실행

Node.js 24 LTS(24.12 이상, 25 미만), npm 11, Python 3.10 이상, Git을 사용합니다.

```sh
npm install
npm run dev
```

[Soundry 열기](http://127.0.0.1:5173). API는 `http://127.0.0.1:3000/api`입니다. loopback에만 바인딩하며 포트가 사용 중이면 원인을 안내하고 종료합니다. Ctrl-C로 화면과 API 서버를 함께 종료합니다. 다른 앱이 5173을 사용 중이면 `.env`에 `UI_PORT=5174`처럼 포트를 명시합니다. 자동으로 다른 포트로 이동하지 않습니다.

## 검증

```sh
npm run qa
npm run qa:smoke
git diff --check
```

`qa`는 lint, strict 타입 검사, 실제 테스트, 두 workspace 빌드와 문서/저장 경계 검사를 실행합니다. `qa:smoke`는 개발 서버를 직접 띄워 health, Vite proxy, 포트 충돌, Ctrl-C 종료를 검사하므로 다른 Soundry 서버를 먼저 종료합니다. 개별 명령은 `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run qa:base`입니다.

## 구조와 설정

- `frontend/`: Vue 3 · Vite · Tailwind, 프로젝트 관리와 workspace/library 화면.
- `backend/`: NestJS · Express, 로컬 API·SQLite/Drizzle migration·프로젝트 CRUD.
- `shared/`: JSON 전송 타입만 공유합니다.
- `harness/`: 개발 서버 실행·검증 도구, 작업 템플릿.
- `docs/`: 설계·계획·QA·리뷰 기록.

선택적으로 `.env.example`을 `.env`로 복사합니다. `API_PORT=3000`은 개발 환경 고정 포트입니다. `SOUNDRY_DATA_DIR`는 데이터 저장 위치이며 기본값은 repository의 `data`입니다. 상대 경로도 repository 기준으로 해석합니다. `MUSIC_PROVIDER=mock`는 후속 생성 단계에서 사용합니다. 키를 `VITE_*`에 넣지 않습니다. `.env`와 사용자 DB/음원은 Git에서 제외합니다.

## 구현 범위

첫 공급자는 네트워크 없이 자체 제작 WAV를 반환하는 MockProvider로 계획했습니다. 화면에 demo임을 명시합니다. 실제 AI 공급자는 공식 schema·비용·전송 경계를 확인한 후 도입합니다. 원격 공급자 사용 시 프롬프트와 선택 설정이 전송되며 로컬 저장과 로컬 AI 추론은 별개입니다.

SQLite + Drizzle + better-sqlite3로 프로젝트를 저장하고, 생성 이력·트랙 테이블은 후속 기능에 사용합니다. 기본 DB `data/soundry.db`, 음원 `data/audio/`, 임시 파일 `data/temp/`를 사용합니다. 데이터 백업은 서버를 종료한 뒤 data 전체를 복사합니다. 지정한 저장 경로에 symlink가 있으면 시작을 거부합니다. macOS 임시 경로를 직접 지정할 때는 `/private/tmp` 같은 실제 경로를 사용합니다. 프로젝트 삭제는 해당 프로젝트의 이력·음원을 함께 삭제하며 진행 중인 작업이 있으면 먼저 취소해야 합니다.

## 설계와 작업 기록

- [전체 설계](docs/architecture/design.md) · [제품 범위](docs/product/product.md)
- [Phase별 구현 계획](docs/product/implementation-roadmap.md)
- [DB](docs/architecture/data-model.md) · [Provider](docs/architecture/provider.md) · [API](docs/architecture/api.md)
- [QA](docs/quality/rules.md) · [개발 절차](docs/architecture/harness.md) · [공식 출처](docs/references/official-sources.md)
- [팀 규칙](AGENTS.md) · [GrooveForge 참고 조사](docs/references/grooveforge.md)

GrooveForge의 코드·DB·런타임을 공유하지 않습니다. 로그인·결제·클라우드 저장·추적을 추가하지 않습니다.
