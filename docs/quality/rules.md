# 품질 규칙

Phase 1 앱 bootstrap을 구현하고 검증했다. 문서 구조·저장 경계와 함께 lint, strict 타입 검사, backend 정책 테스트, production build, dev launcher smoke를 검증한다. 실행되지 않는 명령을 완료한 검증처럼 기록하지 않는다.

## 계획과 작업 경계

- 구현 전에 `docs/exec_plans/active/plan-NNN-<task>.md`를 만든다. 세 자리 번호와 영문 소문자·숫자·하이픈의 작업명을 사용한다.
- 범위나 접근이 바뀌면 계획의 Decision Log를 갱신한다. 계획용 경로는 `docs/exec_plans/active/`와 `docs/exec_plans/completed/`만 사용한다.
- `main`에서 직접 기능을 구현하지 않는다. `codex/plan-NNN-<task>` 브랜치와 격리된 worktree에서 작업한다. Codex 관리형 worktree가 반환한 경로를 우선 사용한다.
- QA를 통과한 뒤 리뷰한다. 리뷰 완료 후 계획을 completed로 옮기고 같은 파일명의 `docs/reviews/plan-NNN-<task>.md`에 근거·결과·잔여 위험을 남긴다.
- 완료 작업은 main 병합, main push, 완료 브랜치 삭제 순으로 마무리한다. 관리형 worktree 정리는 앱 도구를 사용하며, 진행 중 작업이나 프로세스가 의존하는 checkout은 보존한다. 저장소 상태나 권한으로 불가능한 단계는 정확히 보고한다.

## 현재 실행할 검증

저장소 루트에서 Python 3.10 이상과 Git으로 실행한다. 별도 Python 패키지는 필요하지 않다.

```sh
python3 harness/scripts/verify_base.py
git diff --check
```

첫 명령은 저장소 위치를 스크립트 파일에서 계산하므로 다른 디렉터리에서도 절대 경로로 실행할 수 있다. 실패 시 종료 코드는 1이며 문제 경로를 출력한다. 두 번째 명령은 변경분의 공백 오류를 검사한다. 새 파일은 stage한 뒤에도 다시 확인한다.

자동 검사 범위:

- 필수 디렉터리, 핵심 설계 문서, 작업 템플릿의 존재.
- 루트 Markdown이 README와 AGENTS로 제한되는지, 계획 경로·파일명·활성/완료 중복과 완료 계획의 리뷰 기록.
- docs 문서에 남은 미완성 표시와 Markdown 상대 링크의 파일 존재. 코드 펜스·인라인 코드, 외부 주소, 앵커, 템플릿용 경로는 링크 검사에서 제외한다. 외부 주소의 가용성과 문서 내부 앵커의 존재는 검사하지 않는다.
- README의 npm 실행 안내가 실제 루트 package.json의 scripts에 정의되어 있는지. Phase 1부터 루트 package.json의 실행 명령과 대조한다. 예정 명령은 앱 구현 단계에 로드맵과 함께 구체화한다.
- `git ls-files --cached --others --exclude-standard` 결과에 환경 비밀 파일, 개인 키, 로컬 DB, 음원 파일, `data/`, `uploads/`, `outputs/`, `backups/`, `.soundry/` 파일이 포함되는지. 이미 추적 중인 파일은 ignore 규칙만 추가해도 통과하지 않는다.

환경 예시 파일은 `.env.example`, `.env.sample`, `.env.template`만 허용하며 실제 비밀 값을 넣지 않는다. 검사는 파일명과 경로를 확인하고 비밀 내용을 읽거나 출력하지 않는다. 내용 자체의 비밀 탐지를 보장하지 않으므로 리뷰에서 예시·로그·문서의 값도 확인한다. 별도로 승인된 음원 fixture가 필요해지면 출처·권한·용량과 허용 경로를 계획에 기록한 후 검사 규칙을 좁게 변경한다.

## 리뷰 기준

QA 결과와 리뷰 판단을 분리한다. 리뷰는 요청 범위 충족, 제품·DB·API·provider 계약의 일관성, mock/실제 생성 구분, 파일 저장과 삭제 경계, 공식 출처의 적용 범위를 확인한다. 자동 QA 통과가 작곡 품질, 앱 동작 또는 공급자 연동 성공을 뜻하지 않는다.

실패한 검증을 고치거나 재현 가능한 사유와 잔여 위험을 기록한다. 완료 기록에는 실행 명령, 결과, 수행하지 않은 검증과 이유를 명시한다. 실제 사용자 데이터, 인증 정보, 개인 음원을 샘플·테스트·스크린샷에 사용하지 않는다.

## 앱 구현 단계의 추가 검증

Phase 1 명령은 `npm run qa`(lint/typecheck/test/build/base)와 `npm run qa:smoke`(개발 서버·proxy·포트 충돌·종료)다. smoke 전에 다른 Soundry dev 서버를 종료한다. DB 무결성·마이그레이션, 생성 작업 상태 전이·취소·복구, provider 오류, loopback API와 파일 경로 경계, 음원 재생·내보내기 등 위험에 맞는 검증을 각 구현 계획에 배정한다. 존재하지 않는 명령을 현재 QA 통과 조건으로 삼지 않는다.
