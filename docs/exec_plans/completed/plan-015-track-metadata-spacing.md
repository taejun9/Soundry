# plan-015-track-metadata-spacing

## 목표와 범위

320px 생성 이력에서 BPM과 장르가 붙어 보이고 BPM 값과 단위가 분리되는 표시 문제를 고친다. `GenerationHistory.vue`와 필요한 기존 스타일을 수정하고 출시 체크리스트·음원 제작 보고서에 최종 표시 확인을 연결한다. 데이터·API·생성 로직·음원은 변경하지 않는다.

## 소유와 절차

- 제작 provider_research: 이 계획, 생성 이력 component와 해당 기존 CSS.
- 지휘: 별도 Vite UI의 실제 320px 화면 검증, 독립 리뷰, 완료 기록과 Git lifecycle.
- `codex/plan-015-track-metadata-spacing` 관리형 worktree에서 작업한다. primary 코드·실행 서버·실제 데이터와 다른 worktree는 변경하지 않는다.

## Decision Log

- 2026-10-01: BPM 값과 단위는 한 묶음으로 유지하고, 장르와의 간격은 HTML 공백 대신 CSS gap으로 표현한다. 장르는 긴 단어도 카드 너비 안에서 줄바꿈한다. 한쪽 값이 없을 때 구분자를 만들지 않는다.
- 작고 되돌릴 수 있는 표시 수정이므로 새 테스트는 추가하지 않는다. 기존 frontend lint/type/build와 base/diff 검사를 수행한다.
- 의존성이 필요하면 동일 Soundry primary의 Git에서 제외된 node_modules만 symlink로 재사용한다. 다른 프로젝트의 의존성은 사용하지 않는다.

## QA와 완료 조건

- `npx eslint frontend/src --max-warnings 0`
- `npm run typecheck --workspace frontend`
- `npm run build --workspace frontend`
- `npm run qa:base`
- `git diff --check`
- 별도 UI에서 실제 320px/1280px 곡 카드의 간격·줄바꿈·가로 넘침을 확인한다. 누락값 분기는 기존 v-if를 바꾸지 않으므로 소스 검토로 확인하며 실제 누락값 화면 검증과 구분한다.
- QA 후 독립 리뷰를 거쳐 completed/review 기록과 병합·push·브랜치/managed worktree 정리를 지휘가 진행한다. 제작은 커밋하지 않는다.

## 진행 기록

- 2026-10-01: 원인 확인. 인라인 span 경계의 공백이 Vue 출력에서 제거될 수 있고, BPM 묶음에 줄바꿈 제한이 없다. 구현 전 실행 계획을 작성했다.
- 2026-10-01: 메타데이터 행을 줄바꿈 가능한 flex로 표시하고 가로 8px·세로 2px 간격을 적용했다. BPM 값·단위는 nowrap으로 묶고 긴 장르는 카드 안에서 줄바꿈하도록 했다. component와 기존 CSS만 변경했다.
- 2026-10-01: 기존 frontend ESLint, 타입 검사, production build, `npm run qa:base`, `git diff --check` 모두 PASS. 같은 Soundry primary의 의존성을 실제 node_modules 디렉터리 안의 ignored symlink로 재사용했으며 설치·lockfile 변경은 없다.
- 2026-10-01: 지휘가 별도 Vite UI(5175)에서 실제 요청곡으로 확인했다. 320px에서 `Paper Moon Static`의 `118 BPM`이 한 줄을 유지하고 긴 장르가 별도 줄로 구분된다. document scrollWidth=320이다. 1280px에서도 가로 넘침이 없고 짧은 `84 BPM`·Cinematic 사이 간격을 확인했다. 앱 데이터 수정이나 추가 AI 호출은 없었다.
- frontend_bootstrap 독립 리뷰 PASS. 소스와 실제 모바일 이미지에서 조건부 표시 유지·간격·줄바꿈·가독성 및 제한된 변경 범위를 확인했고 추가 P1/P2는 없다. BPM만/장르만/모두 없는 상태는 기존 조건문 검토로 확인했으며 실제 화면으로 각각 재현했다고 주장하지 않는다.
- 전체 음악 제작 변경 main fae496f를 fast-forward로 반영했다. 앱 실행 코드는 충돌이 없었다. QA 후 이 계획을 completed로 이동하고 리뷰 mirror를 남겨 병합·push 및 완료 작업 공간 정리를 진행한다.

## 완료 판정

기존 frontend lint·타입·build와 base·diff PASS, 실제 320px/1280px 표시 QA 및 독립 리뷰 PASS. 입력·재생·생성·저장 로직과 음원 파일은 변경하지 않았다. 누락값 분기는 소스 검토 범위다.
