# 개발 harness와 작업 절차

## 지금 상태

base 스킬의 bundled scaffold를 사용한 뒤 Soundry 기획에 맞춰 구체화했다. 사용자 기획 28항의 설계 승인 gate가 현재 앱 구현을 제한한다. docs/harness 생성은 승인된 이번 작업이다.

## 시작

1. AGENTS.md, 제품, 기술 설계와 현재 계획을 읽는다.
2. working tree와 remote 상태를 확인하고 사용자 작업을 보존한다.
3. 사용 가능한 관리형 worktree를 먼저 확인한다. 새 isolation이 필요할 때 앱 create_worktree 도구와 반환 경로를 사용한다. 도구가 없을 때 `.worktree/plan-NNN-<task>` 수동 checkout을 사용한다.
4. `codex/plan-NNN-<task>` 브랜치에서 active plan을 만들고 범위·검증·완료 조건을 적는다.
5. No Exec Plan, No Work. 문서 변경도 해당 plan의 범위에 포함한다. 변경 방향은 Decision Log에 기록한다.

## 검증과 완료

1. [QA 명령](../quality/rules.md)을 실행한다. 실패를 수정하고 근거를 남긴다.
2. QA 완료 후 리뷰한다. 범위·데이터 경계·사용자 흐름·누락된 검증을 별도 판단한다.
3. 계획을 `docs/exec_plans/completed/`로 이동하고 동일 basename의 리뷰를 `docs/reviews/`에 기록한다.
4. 완료 기록까지 포함한 task commit을 만든다. main이 바뀌었다면 작업 branch에서 통합·검증한다.
5. clean main에 병합하고 origin/main으로 push한다. 이번 $base 호출은 이 문서 작업의 lifecycle을 포함한다. 앱 기능 구현의 별도 승인 경계는 유지한다.
6. 완료 branch를 사용하는 worktree를 detach한 뒤 `git branch -d`로 병합된 branch만 지운다. `-D`는 쓰지 않는다.
7. 더 이상 어떤 작업/process도 필요로 하지 않는 관리형 worktree는 앱 archive_worktree로 보관 정리한다. 단순히 PR이 merged됐다는 이유로 정리하지 않는다. 다음 작업이 곧 필요하면 재사용한다.
8. blocker가 발생하면 그 단계를 우회하지 않고 정확히 보고한다. push 실패 시 강제 push나 branch 삭제를 하지 않는다.

## 문서 원칙

root Markdown은 README/AGENTS만, 영구 지식은 docs, 작업 이력은 exec_plans/reviews, 회의는 meetings에 둔다. 실제 없는 앱 명령은 계획이라고 표시한다. 공식 출처의 사실과 프로젝트 판단을 구분한다.

## 위임

병렬 작업은 파일 또는 조사 책임을 분리하고 서로의 변경을 되돌리지 않는다. QA 실행과 리뷰 판단은 분리한다. Team Soundry 닉네임은 역할 보고에 쓰며 상시 agent를 뜻하지 않는다.
