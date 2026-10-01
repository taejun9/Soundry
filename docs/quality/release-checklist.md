# 실행 준비와 출시 체크리스트

기록일: 2026-10-01. Phase 1–7·9는 main `9876ff6` 기준으로 완료했다. 아래 테스트 수는 각 Phase 완료 당시 기록이며 현재 전체 테스트 수와 구분한다. 기존 리뷰의 “후속 Phase” 표현은 그 리뷰 시점의 잔여 범위다.

현재 main은 **Mock workflow**다. Phase 10 최종 검증을 완료했으며, 실제 AI 생성과 사용자 요청 테스트 음원은 아래 별도 gate에 남아 있다.

## 완료된 기능의 검증 근거

IAB는 Codex 앱 내 브라우저다. IAB 결과를 별도 Chrome 또는 Safari 검증으로 간주하지 않는다.

| Phase / 범위 | 자동·API 검증 | 실제 화면 확인 | 근거 |
|---|---|---|---|
| 1 실행 기반 | npm ci, 29 tests, lint/type/build/base, 개발 서버와 production 시작·포트 충돌·종료 | IAB 1280×900/390×844, route·모바일 메뉴·main 초점·가로 넘침 | [plan-002 리뷰](../reviews/plan-002-bootstrap.md) |
| 2 프로젝트 / SQLite | native DB 설치, 64 tests, CRUD·재시작·DB 종료·격리 smoke | IAB 생성·이름 변경·삭제 확인·연결 오류·재시작 보존·390px | [plan-003 리뷰](../reviews/plan-003-projects-storage.md) |
| 3 작성 화면 | QA 93 tests, 초점 수정 후 96 tests와 frontend lint/type/build | IAB 1280×900/390×844, 장르 예문·초안·미지원 설정·키보드 초점 | [plan-005 리뷰](../reviews/plan-005-workspace-form.md) |
| 4 Mock provider | 116 tests, WAV 재현성·형식·길이·크기·SHA256, compiled DI/API, smoke | IAB 고정 데모·프롬프트 미반영·외부 미전송 안내 | [plan-006 리뷰](../reviews/plan-006-mock-provider.md) |
| 5 생성 작업 | 198 tests, FIFO·취소·timeout·원자적 저장, HTTP 4 WAV·멱등·재시작·삭제 | IAB 취소·재시도·route 이동·서버 중단 복구·1280/390px | [plan-007 리뷰](../reviews/plan-007-job-flow.md) |
| 6 플레이어 / 원본 전송 | 258 tests, Range/HEAD·stream 종료·FD/DB 해제, smoke | IAB 재생 시간·pause·seek·volume·곡 전환·route 유지·ended, 다운로드 SHA256, 1280/390px | [plan-008 리뷰](../reviews/plan-008-player.md) |
| 7 음원 관리 / 입력 재사용 | 294 tests, 이름·삭제 transaction·공개 DTO·이력 보존·cursor | IAB 초안 교체 확인·새 작업·재생 중 이름/삭제 동기화·복사·모바일 dialog | [plan-009 리뷰](../reviews/plan-009-history-tracks.md) |
| 9 즐겨찾기 / 보관함 | 최종 356 tests, strict query·필터·cursor·삭제·재시작, smoke | IAB 두 프로젝트 통합·재생 중 해제·이름 동기화·삭제·키보드 초점 복귀·1280/390px | [plan-011 리뷰](../reviews/plan-011-library-favorites.md) |

Phase 4 이후 음원 검증에는 자체 제작한 고정 8초 Mock 두 개를 사용했다. 이는 새 AI 작곡물이나 요청한 90–180초 테스트 음원이 아니다. 신호·파일 검사와 브라우저 재생 확인을 음악적 품질 청취로 바꾸어 기록하지 않는다.

## Phase 10 최종 확인

최종 검증은 Mock 흐름과 표시 개선 범위다. [plan-012 리뷰](../reviews/plan-012-release-polish.md)에 QA 이후 독립 검토와 한계를 기록한다.

| 확인 항목 | 상태 | 근거 |
|---|---|---|
| 현재 lockfile의 fresh npm ci | PASS | Node v24.15.0/npm 11.12.1, 298개 설치·301개 audit·취약점 0, lockfile 변화 없음 |
| 최종 lint/typecheck/test/build/base/audio | PASS | `npm run qa`, 37 files / 356 tests 및 모든 단계 통과 |
| 개발 서버 시작·proxy·충돌·정상 종료 | PASS | `UI_PORT=5174 npm run qa:smoke`, API/UI/충돌/Ctrl-C 후 포트 해제 |
| compiled API 전체 흐름 | PASS | 격리 DB의 프로젝트·2 jobs×2 WAV·멱등 접수·즐겨찾기·한글/emoji 이름·프로젝트 수정·원본 SHA/Range/HEAD·재시작 후 DTO/이력/파일 보존. 삭제 검증은 앞선 Phase 7·9 근거를 따른다. |
| 실제 IAB 최종 흐름 | PASS | 320px에서 4000자 프롬프트 생성/이력과 120자 제목·재생·끝 스크롤 확인. 가로 넘침 없음, 플레이어와 spacer 각166px. 첫 사용·390px·키보드·오류는 위 Phase별 근거 참조. |
| 별도 Chrome | PASS · 한정 범위 | native Chrome 별도 탭에서 보관함·재생·0.6초 위치·일시 정지 확인. QA 탭 정리 완료. |
| 별도 Safari | PASS · 한정 범위 | native Safari 별도 탭에서 보관함·재생·일시 정지·4초 seek 확인. QA 탭 정리 완료. |
| README대로 사용자 실행 환경 준비 | PASS | 기존 .env 부재 확인 후 비밀 없는 Mock/UI_PORT5174 설정을 exclusive create/0600으로 준비. primary main에서 `npm run dev` 준비 완료와 IAB 빈 프로젝트 화면·서버 연결 확인. 사용자 데이터와 QA 데이터 분리. 종료는 격리 smoke로 확인했으며 사용자 서버는 실행 유지. |
| 독립 리뷰와 완료 기록 | PASS | backend_bootstrap의 표시·접근성·README·시각 근거 검토, 추가 P1/P2 없음. 독립 diff/base QA 통과. completed 계획과 동일 basename 리뷰 기록. |

Chrome·Safari 결과는 표에 적힌 동작만 보장한다. native 화면 자료는 개인 브라우저 UI를 포함하므로 로컬 QA에만 보관한다. IAB 시각 자료는 모바일 긴 입력/제목과 마지막 카드 접근을 확인하는 데 사용했다.

## 별도 미완료 gate

| 항목 | 현재 근거 | 남은 작업 |
|---|---|---|
| Phase 8 실제 Fal 연동 | 격리 worktree의 `plan-010-real-provider`에 구현. 최종 389 tests·lint/typecheck/build/base/audio·개발 smoke 및 backend/frontend 독립 리뷰 PASS. 키 미설정 UI를 IAB에서 확인했다. **실제 생성 gate 전이므로 main 미병합.** | backend FAL_KEY와 Fal 잔액 준비 후 현재 main 변경 통합·QA, 실제 생성 → 로컬 저장 → 청취/다운로드 |
| 요청한 테스트 음원 20곡 | `plan-004-test-music`에서 16개 장르와 두 참고 음악 방향의 독창적 콘셉트 각 2곡을 준비. **실제 생성 0곡·다운로드 0곡·실제 청취 0곡.** 첫 요청은 HTTP 403 balance_exhausted로 거절되었고 request ID가 없었다. | 각 90–180초 음원 제작, 길이·형식·신호 검사와 청취 결과 구분, WAV·제목·설명·태그·provenance·SHA256 정리 후 Downloads 전달 |
| 실제 생성 재개 조건 | 계정 잔액 부족과 backend 키 미설정. 키를 채팅이나 프론트로 받지 않으며 준비 전 유료 요청을 반복하지 않는다. | 사용자 환경에서 잔액과 backend 키를 준비. 첫 실제 생성은 20곡 중 대표곡으로 사용해 중복 테스트 비용을 피한다. |

Fal transport 대역의 저장·다운로드 성공은 실제 Fal 연결 성공이 아니다. 별도 음원 도구의 합성 fixture 패키징 QA도 요청 음원 완료로 집계하지 않는다. 실제 SoundCloud 업로드는 수행하지 않았으며 상업 유통 권리나 원격 과금 취소를 보장하지 않는다.

## 재현 명령과 데이터 범위

저장소 루트에서 실행한다. 개발 서버 smoke에 필요한 API 3000과 선택한 UI 포트가 비어 있어야 한다.

```sh
npm ci
npm run qa
UI_PORT=5174 npm run qa:smoke
git diff --check
```

자동 API 검증은 임시 데이터 root와 자체 fixture를 사용한다. 실제 사용자 DB·키·음원이나 원격 결과 URL을 Git·리뷰 예시에 넣지 않는다. 브라우저에서 만든 QA 음원도 자체 Mock 검증 데이터와 요청한 테스트곡을 구분한다. 저장 폴더 백업은 Soundry 서버를 종료하고 전체 폴더를 복사하는 [README 절차](../../README.md)를 따른다.
