# plan-001-project-base

## Status

completed — 초기 설계 및 base scaffold 완료. 설계안 채택과 Phase 1 구현은 사용자 승인 대기.

## Owner

project_lead / 지휘, plan_keeper / 설계

## User Request

$base와 첨부 Soundry 기획을 바탕으로 독립 로컬 AI Music Studio의 초기 설계 13개 항목을 작성한다. 설계 보고 후 승인을 받고 Phase 1을 시작한다.

## Goal

검토 가능한 제품·기술 설계, 공식 출처, agent map, 실행 계획 및 반복 가능한 문서 QA를 만든다.

## Non-Goals

앱 코드, 패키지 설치, 실제 AI 호출, 데이터 생성, GrooveForge 코드 이식, 배포.

## Context Map

- README.md: 기존 두 줄 소개.
- docs/product/: 요구사항과 단계별 계획.
- docs/architecture/: 구조, DB, provider 및 API 계약.
- docs/quality/, docs/privacy/, docs/references/: 검증·경계·근거.

## Constraints

- No Exec Plan, No Work. main에서 직접 구현하지 않는다.
- QA 후 리뷰하고 완료 계획과 리뷰 기록을 남긴다.
- 사용자 기획의 설계 승인 경계를 지킨다.

## Implementation Plan

- [x] 사용자 기획 및 기존 저장소 조사
- [x] bundled scaffold 실행 및 한국어로 구체화
- [x] 초기 설계 13개 항목, MVP 및 단계별 완료 기준 작성
- [x] 공식 출처와 GrooveForge 참고 범위 기록
- [x] 문서/계획/링크/보관 경계를 검사하는 QA 작성 및 실행
- [x] QA 후 독립 리뷰, 수정, 완료 계획 및 리뷰 기록
- [x] 문서 변경만 병합 대상으로 정리하고 완료 lifecycle 준비

## QA Plan

python3 harness/scripts/verify_base.py 및 git diff --check. 실제 앱 테스트는 구현 전이므로 해당하지 않는다.

## Review Plan

QA 통과 후 기획 충족, 상태/DB/API 일관성, 설계 승인 경계를 검토한다.

## Decision Log

| date | decision | reason |
|---|---|---|
| 2026-09-30 | docs/harness 기반까지만 생성 | 사용자 기획 28항이 설계 보고 후 구현 승인을 요구 |
| 2026-09-30 | Codex 관리형 worktree 사용 | 앱 지침에 따라 생성 도구 반환 경로 사용; .worktree 수동 생성 대체 |
| 2026-09-30 | 기존 README 제목을 유지하고 소개 확장 | 사용자 기획 25항의 README 내용 요청 반영 |
| 2026-09-30 | Vue/NestJS/SQLite, Drizzle + better-sqlite3, 단일 HTMLAudio, REST polling | 사용자가 제시한 stack과 작은 로컬 workflow를 기준으로 선택; 정확한 버전 설치는 구현 단계 |
| 2026-09-30 | 설계·read-only 조사와 harness 역할을 분리 | 파일 소유가 겹치지 않는 병렬 작업과 QA 후 리뷰로 품질 확보 |

## Progress Log

| date | role | note |
|---|---|---|
| 2026-09-30 | 지휘 | origin/main 27bb2cd에서 codex/plan-001-project-base 분리 |
| 2026-09-30 | 검증 | verify_base.py 및 staged diff whitespace 검사 통과; harness는 정상/오류 fixture로도 확인 |
| 2026-09-30 | 심사 | QA 후 독립 리뷰: project pagination의 updatedAt/id 정렬과 cursor 쌍을 명시하도록 수정 |
| 2026-09-30 | 심사 | 수정 확인 완료, 추가 finding 없음 |

## Completion Notes

초기 문서 QA에서 예정 npm 명령을 현재 README의 실행 안내로 검출했다. 목표 명령은 로드맵에 두고 README에는 미구현 상태와 링크를 명시하도록 수정했다.

- 초기 설계 13항, MVP, Phase 1–10, 공식 근거 11개, GrooveForge 조사, 한국어 agent map/템플릿, 문서 QA를 작성했다.
- bundled scaffold는 기존 README를 skip했다. 이후 사용자 기획 25항에 따라 기존 제목을 보존하며 소개를 확장했다. 다른 기존 파일은 없었다.
- 검증: verify_base.py, git diff --check, git diff --cached --check 통과. 독립 리뷰의 pagination P2 수정 및 재검토 완료.
- 앱 코드·DB·의존성·원격 AI 호출은 만들지 않았다. 앱 테스트/실제 생성은 구현 전이라 수행하지 않았다.
- 남은 의사결정: 설계 승인, 실제 provider/model 선택, 설치 버전 및 대상 Mac의 native SQLite 호환 검증.
- [완료 리뷰](../../reviews/plan-001-project-base.md).
- 문서 commit 이후 main 병합·push·병합 branch 삭제·관리형 worktree 정리를 순차 실행한다. 실제 git 종료 결과는 사용자 종료 보고에서 확인한다.
