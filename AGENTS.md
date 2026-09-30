# Team Soundry

Soundry는 혼자 사용하는 로컬 AI Music Studio다. 한국어로 보고하며 `<닉네임>: <내용>` 형식을 쓴다.

## 역할

| 역할 | 닉네임 | 책임 |
|---|---|---|
| project_lead | 지휘 | 범위·의사결정·사용자 보고 |
| plan_keeper | 설계 | 실행 계획·결정 기록·완료 이동 |
| repo_cartographer | 지도 | 저장소와 도메인 경계 |
| harness_builder | 제작 | 반복 가능한 검증 도구 |
| quality_runner | 검증 | QA 실행과 근거 기록 |
| review_judge | 심사 | QA 이후 독립 검토 |
| privacy_guard | 수호 | 키·로컬 파일·외부 전송 경계 |
| doc_gardener | 정리 | 문서·리뷰 기록 정합성 |

역할표는 책임 지도이며 상시 실행 중인 agent 목록이 아니다. 위임 시 파일 소유 범위를 분리하고 다른 변경을 되돌리지 않는다.

## 먼저 읽을 문서

- [제품과 범위](docs/product/product.md), [단계별 계획](docs/product/implementation-roadmap.md)
- [전체 설계](docs/architecture/design.md), [DB](docs/architecture/data-model.md)
- [Provider](docs/architecture/provider.md), [API](docs/architecture/api.md)
- [작업 절차](docs/architecture/harness.md), [QA](docs/quality/rules.md)
- [데이터 경계](docs/privacy/principles.md), [공식 출처](docs/references/official-sources.md)

## 작업 규칙

- **No Exec Plan, No Work.** 시작 전에 `docs/exec_plans/active/plan-NNN-<task>.md`를 만든다.
- 설계 변경은 계획의 Decision Log에 먼저 또는 동시에 기록한다. `docs/plan`은 사용하지 않는다.
- `main`에서 직접 구현하지 않는다. `codex/plan-NNN-<task>` 브랜치와 격리 worktree를 사용한다.
- Codex 앱에서는 기존 active worktree를 확인하고 관리형 생성 도구가 반환한 경로를 사용한다. 도구가 없을 때만 `.worktree/plan-NNN-<task>`를 사용한다.
- QA → 리뷰 → 계획 completed 이동·리뷰 mirror → main 병합·push → 병합 브랜치 `git branch -d` → 완료 worktree 정리 순서를 지킨다. 관리형 worktree는 앱 archive 도구로 정리한다.
- 실패한 단계는 우회하지 말고 blocker를 기록한다. [상세 절차](docs/architecture/harness.md)를 따른다.
- **2026-09-30 전체 기능 구현이 승인되었다. Phase별 실행 계획과 QA·리뷰 gate를 지켜 구현한다.**
- GrooveForge는 참고 저장소다. 코드·DB·홈 디렉터리·런타임 의존성을 공유하지 않는다.
- 로그인·결제·클라우드 저장·추적·원격 AI 자동 호출을 추가하지 않는다.
- 루트 Markdown은 README.md와 AGENTS.md만 둔다. 실제 데이터와 `.env`를 Git에 넣지 않는다.
