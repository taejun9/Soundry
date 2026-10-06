# plan-018-screen-music-qa

## Status
completed

## Owner
project_lead / plan_keeper

## User Request
2026-10-06: all test and lint clean. 실제 화면에서 모든 테스트. 비기와 투팍 참고 방향 10곡을 각 90초 이상 생성하고 Downloads에 SoundCloud 업로드용 정리.

## Goal
전체 자동 QA와 실제 화면의 핵심·오류·회원·편집 흐름을 검증하고 문제를 수정한다. 서로 다른 10곡의 실제 WAV·길이·신호·SHA를 검사해 제목·설명·태그와 함께 전달한다.

## Non-Goals
SoundCloud 계정 업로드, 결제, 보컬 모방, 사용자 기존 DB 변경, 자동 유료 API 전환.

## Context Map
- frontend/src/features, backend/src, harness/music, harness/scripts
- docs/quality/rules.md, docs/architecture/harness.md, docs/privacy/principles.md

## Constraints
관리형 worktree와 codex 브랜치. 실제 데이터는 Git 밖에 보존. QA → 별도 리뷰 → 완료 기록 → main 병합·push → 브랜치 삭제 → archive.

## Implementation Plan
- [x] fresh 의존성 준비, 전체 QA·smoke 실행.
- [x] 격리 데이터 실제 화면 랜딩/회원/등급/프로젝트/생성/플레이어/이력/보관함/편집/다운로드/오류/반응형 검증.
- [x] 10곡 제작 도구 확장과 Node/Python 회귀 검증.
- [x] 동부 붐뱁 5곡·서부 G-funk 5곡, 전곡120초 실제 CLI 제작과 다운로드 패키징.
- [x] QA 근거·별도 리뷰·완료 기록 준비. Git lifecycle은 task commit 이후 아래 순서로 실행.

## QA Plan
npm ci; SOUNDRY_PYTHON=bundled-python npm run qa; UI_PORT=5174 npm run qa:smoke; git diff --check. 실제 브라우저 화면 조작 및 파일 독립 WAV/SHA/신호 검사. 수행하지 않은 청취·브라우저 범위는 명시한다.

## Review Plan
QA 이후 요청 충족·파일/회원 경계·검증 공백을 별도 검토하고 docs/reviews에 mirror한다.

## Decision Log
| date | decision | reason |
|---|---|---|
| 2026-10-06 | plan-018 관리형 worktree, 격리 data root | 기존 데이터 보존과 재현 가능한 QA |
| 2026-10-06 | 참고 아티스트의 음악적 특징을 각각 5곡의 새로운 연주곡에 반영 | 현재 CLI provider의 instrumental 계약과 사용자 10곡 요구 |

| 2026-10-06 | 음악 제작 도구의 고정 20곡 제한을 연속 번호 1–20곡으로 일반화 | 요청 10곡을 중복·가짜 곡 없이 기존 검증·재개·패키징 경계로 제작 |

## Progress Log
| date | role | note |
|---|---|---|
| 2026-10-06 | 설계 | 필수 문서·clean main·active artifact 부재 확인, 계획 생성 |

| 2026-10-06 | 검증 | 앱456·Node18·Python23 및 lint/type/build/base/Mock WAV PASS. 실제 화면·Chrome 믹스 파일·Safari 한정 재생 smoke 확인 |
| 2026-10-06 | 제작 | 첫 곡 화면 접수→CLI 생성→120초 WAV 다운로드·SHA 일치, 나머지 곡 순차 제작 중 |

| 2026-10-06 | 제작 | 실제10곡 completed·120초·신호경고0, Downloads 패키지·독립 파일/포맷/SHA 검증 완료 |
| 2026-10-06 | 심사 | QA 후 별도 검토 PASS, completed 이동·리뷰 mirror 작성 |

## Completion Notes
앱456·Node18·Python23·lint/type/build/base/audio/smoke PASS. 실제 IAB 주요 흐름·소유권/사용량/편집·Chrome 믹스 파일·Safari 한정 smoke·전곡재생 PASS. 10곡 모두120초/고유SHA10/신호경고0/원본과업로드bytes동일. Downloads/Soundry_East_West_10_2026-10-06에 WAV·메타데이터·보존 원본을 전달했다. 상세 근거와 미수행 음색 청취·영구 삭제 UI 범위는 docs/quality/plan-018-verification.md, QA 후 별도 검토 mirror는 docs/reviews/plan-018-screen-music-qa.md. 다른 독립 agent를 실행하지 않았다.

완료 기록 포함 task commit → clean main fast-forward 병합·origin/main push → worktree detach·git branch -d → 서버를 primary checkout으로 이동 → 관리형 archive 순으로 마무리한다. WAV·생성 데이터·최종 화면 이미지는 worktree 밖에 보존한다. Git의 최종 결과는 commit/history와 최종 사용자 보고로 확인한다.
