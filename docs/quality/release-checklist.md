# 실행 준비와 출시 체크리스트

최종 갱신일: 2026-10-02. Phase 1–7·9는 main `9876ff6` 기준으로 완료했다. 아래 테스트 수는 각 Phase 완료 당시 기록이며 현재 전체 테스트 수와 구분한다. 기존 리뷰의 “후속 Phase” 표현은 그 리뷰 시점의 잔여 범위다.

Phase 10의 Mock workflow 최종 검증에 이어, plan-013에서 기본 경로를 **Codex CLI 작곡·로컬 WAV 합성**으로 전환했다. 실제 150초 곡의 생성·저장·화면 재생·원본 다운로드를 검증했다. 요청한 20곡의 제작과 Downloads 패키징도 완료했으며 아래에서 앱 검증과 구분해 기록한다.

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

## CLI 생성 전환과 테스트 음원

2026-10-01 사용자 요청으로 유료 Fal 연동을 제외했다. 기존 미병합 구현은 보존했으며 잔액 충전이나 FAL_KEY는 진행 조건이 아니다. `plan-013-cli-generation`에서 Codex CLI 작곡과 로컬 WAV 합성을 구현·검증했다.

| 항목 | 현재 근거 | 남은 작업 |
|---|---|---|
| CLI 구현 | 전체 41 files / 433 tests, lint/typecheck/build/base/audio PASS. CLI adapter 및 별도 composition renderer 독립 리뷰 PASS. | 없음 |
| 실제 CLI E2E | 첫 출력 검증 실패를 상태에 보존하고 명시적으로 재시도했다. 실제 150초/44.1kHz/stereo/PCM16 WAV 완료, full-scale 0·최장저레벨0.5초·신호경고0. 원본 다운로드 SHA256 일치 및 Range206. | 음악적 품질의 실제 청취는 수치·화면 확인으로 대체하지 않음 |
| 실제 IAB 화면 | 320px 가로 넘침 없음. 89초 입력 차단·세부설정 자동열림·초점 이동, 실패→입력 확인→새 요청, 완료 표시·재생시간 증가·75초 seek·일시 정지 확인. | 이 CLI 곡의 별도 native 브라우저 검증은 수행하지 않음 |
| 개발 서버 smoke | 기존 서버 종료 후 API·proxy·UI·포트 충돌·Ctrl-C 정상 종료 PASS. 첫 시도는 기존 서버가 점유해 종료 검사가 실패했으며 종료 후 재실행했다. | 없음 |
| 요청 음원 20곡 | 장르 16곡·그루비룸 참고 2곡·천재노창 참고 2곡 완료. 모두 실제 150초·stereo 44.1kHz PCM16, 고유 SHA256 20개, 신호 경고 0. `Downloads/Soundry_SoundCloud_2026-10-01`에 WAV·제목·설명·태그·원본·provenance·manifest 정리. | 실제 음색 청취는 미수행으로 기록 |
| 최종 20곡 IAB 화면 | 프로젝트 20곡·작업 22개(실패 이력 2개 포함), 첫·마지막 곡 제목 확인. 320px 가로 넘침 없음. 마지막 곡 재생 시간 24.9초 증가 후 pause 확인. 10번 곡 End 키 탐색 후 재생 완료 상태 확인. | 이 CLI 곡들의 별도 native 브라우저 검증은 수행하지 않음 |
| 음악 제작 도구 | Node 16개·Python 21항목 PASS. batch 복구·개인정보·WAV/원본 유지 경계 독립 리뷰 PASS. 안내 필드 preflight 순서 보완 후 URL·인증 문자열 2개 경계 독립 확인. 실제 20곡 패키징 exit 0. | 없음 |

합성 fixture 패키징 QA는 요청 음원 완료로 집계하지 않는다. 실제 SoundCloud 업로드는 수행하지 않았다. [음원 제작 보고서](test-music-report.md)에 곡 목록·파일 근거·청취 한계를 기록한다. CLI 계정 사용 한도가 적용되며 추가 유료 음악 API나 자동 재시도는 없다.

## 재현 명령과 데이터 범위

전체 QA는 Python 3.10 이상과 NumPy가 필요하며, 기본 Python에 NumPy가 없으면 [README의 SOUNDRY_PYTHON 안내](../../README.md#검증)를 따른다. 저장소 루트에서 실행한다. 개발 서버 smoke에 필요한 API 3000과 선택한 UI 포트가 비어 있어야 한다.

```sh
npm ci
npm run qa
UI_PORT=5174 npm run qa:smoke
git diff --check
```

자동 API 검증은 임시 데이터 root와 자체 fixture를 사용한다. 실제 사용자 DB·키·음원이나 원격 결과 URL을 Git·리뷰 예시에 넣지 않는다. 브라우저에서 만든 QA 음원도 자체 Mock 검증 데이터와 요청한 테스트곡을 구분한다. 저장 폴더 백업은 Soundry 서버를 종료하고 전체 폴더를 복사하는 [README 절차](../../README.md)를 따른다.

## 끝마디 실사용 보완

[plan-014 리뷰](../reviews/plan-014-score-endings.md):마지막반복의부분마디를정확한요청길이로마감하도록수정했다. 기존실패악보의parse/150초렌더와새실제CLI팝곡의앱저장·다운로드PASS. 현재전체41files/443tests및lint/type/build/base/audioPASS,독립리뷰추가P1/P2없음. 앞선433개는plan013완료시점기록이다.

## 최종 모바일 곡 정보 표시

[plan-015 리뷰](../reviews/plan-015-track-metadata-spacing.md): 실제 20곡 점검에서 발견한 BPM·긴 장르명 붙음 현상을 보완했다. frontend lint/type/build·base/diff 및 독립 소스·모바일 이미지 리뷰 PASS. 실제 320px/1280px에서 가로 넘침 없이 BPM 묶음과 장르 간격을 확인했다. 누락값은 기존 v-if의 소스 검토 범위이며 이번 표시 변경에서 전체 443개 테스트를 재실행하지는 않았다.

## 전체 코드 설명과 재검증

[plan-016 리뷰](../reviews/plan-016-quality-release.md)와 [전체 검증 기록](plan-016-verification.md): 앱 443 tests, Node 16 tests, Python 21항목 및 lint/typecheck/build/base/audio/smoke PASS. 기존 코드 140개 전수 주석 보강과 QA launcher 추가, 프로세스 테스트 동기화 개선, 실제 IAB 주요 기능·반응형 검증, 기존 Downloads 20곡 전수 검사와 독립 리뷰를 완료했다.

## 2026-10-06 회원·비트 편집 확장

plan-017의 로컬 회원/등급/usage ledger·랜딩/상품·다중 행 클립 편집을 추가했다. 앱 43 files / 456 tests, 기존 음악 Node16·Python21, lint/type/build/base/Mock WAV/smoke PASS. 실제 임시 DB/IAB 편집·행 추가·저장/복원·미리듣기·반응형 및 관리자 보호를 확인했다. WAV 링크 준비까지 검증했으며 IAB에서 실제 파일 다운로드와 음색 청취는 미검증이다. [리뷰와 검증 범위](../reviews/plan-017-studio-membership.md)를 따른다.
