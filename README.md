# Soundry

Local-first AI Music Studio. 개인 컴퓨터에서 프롬프트로 음악을 생성하고, 듣고 비교하고, 프로젝트별로 관리하는 독립 웹앱입니다.

**현재 상태: 초기 설계 및 개발 기반 작성 완료. 앱 구현은 설계 승인 후 Phase 1부터 진행합니다.** 현재 실행 가능한 frontend/backend 또는 `package.json`은 없습니다. GrooveForge를 개조하거나 마이그레이션하지 않습니다.

## 설계 검토

- [전체 설계와 기술 선택](docs/architecture/design.md)
- [제품 범위](docs/product/product.md) · [Phase 1–10 구현 계획](docs/product/implementation-roadmap.md)
- [SQLite 모델](docs/architecture/data-model.md) · [Provider 계약](docs/architecture/provider.md) · [API](docs/architecture/api.md)
- [GrooveForge 참고 조사](docs/references/grooveforge.md) · [공식 문서 근거](docs/references/official-sources.md)

## Requirements

설계 기준은 Node.js 24 LTS의 24.12 이상, npm, 최신 데스크톱 브라우저입니다. 구현 시 호환되는 정확한 버전을 lockfile에 고정합니다. 현재 문서 검증에는 Python 3.10 이상과 Git만 필요합니다.

## Installation / Development

현재 실행 가능한 검증:

```sh
python3 harness/scripts/verify_base.py
git diff --check
```

Phase 1에서 루트 설치·실행 명령을 제공할 예정입니다. 구체적인 목표 명령은 [구현 계획](docs/product/implementation-roadmap.md)에 있으며 **현재 앱을 실행할 수 없습니다.** UI는 `http://localhost:5173`, API는 `http://localhost:3000`을 목표로 하며 loopback에만 바인딩합니다.

## Project Structure

현재는 `docs/`와 `harness/`가 있습니다. 승인 후 `frontend/`(Vue), `backend/`(NestJS), `shared/`(전송 타입), 런타임 `data/`를 추가합니다. 두 앱은 npm workspaces와 하나의 lockfile로 관리합니다.

## Environment Variables

설계된 설정은 `SOUNDRY_DATA_DIR`, `MUSIC_PROVIDER=mock`, `API_PORT=3000`입니다. Phase 1에서 값 검증과 `.env.example`을 추가합니다. 실제 공급자를 선택할 때만 해당 키(예: `FAL_KEY`)를 backend 설정에 추가합니다. 키를 `VITE_*` 변수에 넣지 않습니다.

## Music Generation Providers

첫 구현은 실제 재생 가능한 자체 제작 WAV 샘플을 반환하는 MockProvider입니다. 화면에 Mock를 명시하며 AI가 만든 결과라고 표시하지 않습니다. 외부 AI 또는 로컬 모델은 Phase 8에서 하나를 선택합니다. 로컬 저장과 로컬 추론은 별개이며 외부 공급자는 프롬프트를 외부로 전송할 수 있습니다.

## Local Storage / Database

SQLite + Drizzle + better-sqlite3를 설계 기준으로 선택했습니다. DB는 `data/soundry.db`, 음원은 `data/audio/`, 임시는 `data/temp/`에 저장합니다. 실행 시 단일 설정 계층에서 경로를 결정하며 데이터 전체는 Git에서 제외합니다. 원본 포맷 다운로드를 제공하고 MVP에 변환기를 추가하지 않습니다.

## Agent Harness

Team Soundry의 책임은 [AGENTS.md](AGENTS.md)에, 작업 절차는 [harness 문서](docs/architecture/harness.md)에 있습니다. 모든 구현은 active exec plan과 작업 브랜치에서 시작하며 QA 후 리뷰합니다.
