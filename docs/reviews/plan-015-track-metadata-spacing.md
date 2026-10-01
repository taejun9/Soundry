# plan-015-track-metadata-spacing 리뷰

2026-10-01 QA 이후 독립 리뷰 PASS. 생성 결과 카드에서 `118 BPM`과 긴 장르명이 붙거나 BPM 값·단위가 나뉘어 보이던 문제를 수정했다. 메타데이터 행을 줄바꿈 가능한 flex와 8px 간격으로 구성하고 BPM은 nowrap, 장르는 카드 안에서 줄바꿈하도록 했다. 기존 조건부 표시·데이터·API·생성 및 재생 로직은 유지했다.

## 검증

`npx eslint frontend/src --max-warnings 0`, `npm run typecheck --workspace frontend`, `npm run build --workspace frontend`, `npm run qa:base`, `git diff --check` PASS. 저위험 표시 변경이므로 새 테스트나 추가 음악 생성은 하지 않았다. 앱의 기존 전체 443개 테스트 근거는 plan014에 있으며 이번 변경에서 전부 다시 실행했다고 기록하지 않는다.

지휘가 별도 로컬 UI의 실제 곡 카드로 확인했다. 320px에서 `Paper Moon Static`의 `118 BPM`은 한 줄, 긴 장르는 별도 줄로 표시되고 가로 넘침이 없다(scrollWidth=320). 1280px에서 scrollWidth=1280이며 `84 BPM`·Cinematic 간격도 확인했다. 이미지 `cli-metadata-spacing-mobile.png`를 로컬 QA 자료로 보존했다.

frontend_bootstrap이 소스와 실제 모바일 이미지를 독립 검토했다. BPM/장르의 기존 v-if 유지, 불필요한 구분자 없음, 간격·줄바꿈·가독성, component와 CSS 3규칙으로 제한된 변경을 확인해 PASS, 추가 P1/P2 없음으로 판정했다. BPM만·장르만·둘 다 없는 경우는 소스 검토로 확인했으며 실제 화면에서 각각 재현하지 않았다.

음원 제작·Downloads 패키지의 완료 근거는 plan004를 따른다. 임시 검증 UI와 사용이 끝난 관리형 worktree는 통합 후 정리하고 primary 앱과 실제 음원 파일은 유지한다.
