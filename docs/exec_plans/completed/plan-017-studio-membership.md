# plan-017-studio-membership

## Status
completed

## Owner
project_lead / plan_keeper

## User Request
2026-10-06: 기본 A와 B/C/D/E 구간을 여러 행으로 겹쳐 비트 편집, 하단 행 추가, 랜딩페이지, 회원·등급, 결제 연동 없는 상품 페이지, 등급별 사용량 제한(관리자 무제한).

## Goal
기존 음원 클립을 여러 행에 배치하고 시작·길이·볼륨을 편집·저장·미리듣기한다. 로컬 회원·등급 정책이 서버에서 적용되고 랜딩·상품·회원 관리 화면이 연결된다.

## Non-Goals
결제 연동, 원격 배포·저장, 추적, 원격 AI 자동 호출, 피아노롤·파형 분석.

## Context Map
- frontend/src/features, backend/src/projects, backend/src/generations, backend/src/tracks
- shared/contracts.ts, backend/src/database, docs/architecture

## Constraints
격리된 관리형 worktree 및 codex branch. 기존 데이터 보존. QA → 리뷰 → completed/리뷰 mirror → main 병합·push → branch 삭제·archive.

## Implementation Plan
- [x] 다중 행 클립 편집·저장·로컬 미리듣기.
- [x] 회원·세션·등급·사용량 제한·관리자 기능.
- [x] 랜딩·상품·회원 화면과 내비게이션.
- [x] 문서, QA, 리뷰, git lifecycle.

## QA Plan
npm run qa, npm run qa:smoke. 임시 DB 회원 인증·권한·사용량·클립 검증. 실제 브라우저 편집·행 추가·회원·상품·반응형 확인.

## Review Plan
QA 후 요청 충족·데이터 경계·회원 소유권·사용량 우회·오디오 정리를 별도 검토.

## Decision Log
| date | decision | reason |
|---|---|---|
| 2026-10-06 | 기존 Vue/Nest 앱 확장 | 스튜디오와 정책 연결 |
| 2026-10-06 | 로컬 계정, 해시 비밀번호, 서버 세션 | 외부 인증 서비스 없이 요청 충족; 기존 로그인 제외 정책 변경 |
| 2026-10-06 | 첫 가입자는 관리자, 기존 프로젝트 인계 | 기존 데이터 보존 |
| 2026-10-06 | Free/Plus/Pro 월 10/100/500 variation, 관리자 무제한 기본 | 사용자 답변 전 진행 가능한 정책; 실패/취소 차감 제외 |
| 2026-10-06 | 관리자가 수동 등급 지정 | 결제 연동 없는 상품 페이지 요청 |
| 2026-10-06 | Track를 소스로 한 초 단위 클립/행 프로젝트 저장 | 긴 A와 중간 B/C, 행 추가 지원; 멀티트랙 제외 정책 변경 |

## Additional Decisions

- 2026-10-06: WAV는 OfflineAudioContext에서 렌더링한 뒤 명시적 다운로드 링크로 제공한다. 느린 다운로드에서 Blob URL이 너무 빨리 폐기되지 않게 다음 렌더링/화면 해제까지 유지한다.
- 원본 디코딩 캐시는 현재 믹스에 사용하는 ID만 보존해 원본 8개·합계 600초 제한이 반복 편집에서도 유지되게 한다.
- 사용자에게 등급 기본안을 질문했으며 응답이 없어 안내한 Free/Plus/Pro 10/100/500곡으로 구현한다.

## Progress Log
| date | role | note |
|---|---|---|
| 2026-10-06 | 설계 | 필수 문서, clean main, worktree 확인 후 관리형 worktree와 브랜치 생성 |
| 2026-10-06 | 검증 | 전체 QA 456개, 음악·smoke·실제 IAB PASS; 다운로드 미검증 경계 기록 |
| 2026-10-06 | 심사 | QA 후 별도 소스 검토 PASS, completed 이동 및 리뷰 mirror |

## Completion Notes
전체 QA(lint/type/456 tests/build/base/Mock WAV/음악 Node16·Python21)와 최신 smoke PASS. 실제 임시 DB/IAB 다중 행 편집·행 추가·저장·복원·미리듣기, 랜딩/상품/관리자 및 반응형 확인. QA 후 별도 소스 검토 PASS, 리뷰 mirror는 `docs/reviews/plan-017-studio-membership.md`.

WAV PCM16 encoder/브라우저 렌더링·Blob 링크는 확인했으나 IAB download 이벤트 제한으로 실제 디스크 다운로드·음색 청취는 미검증이다. 외부 AI·사용자 DB·개인 음원은 사용하지 않았다. 기본 Python의 NumPy 누락은 확인된 bundled Python 지정으로 해결했다. UUID 정규화 타입 오류와 URL 대소문자 권한 우회, 큰 숫자의 렌더링 할당 경계를 수정하고 최종 QA를 재실행했다.

완료 기록을 포함한 커밋 후 clean main fast-forward 병합·origin/main push·브랜치 삭제·관리형 archive를 순서대로 수행한다. 결과는 Git history와 최종 보고에서 확인한다.
