# plan-009-history-tracks

## 목표와 범위

Phase 7: 생성 결과를 듣고 비교하며 이름 변경·삭제하고, 과거 프롬프트를 재사용한다. Phase 6은 490e248로 main push 완료했다. 기존 관리형 앱 worktree를 재사용한다.

- GET /tracks/:id: TrackDetail(원본 requestedSettings/requestedVariationCount). PATCH title/favorite 엄격 검증, DELETE는 generation 이력 보존·project.updatedAt 반영·DB 우선 삭제 후파일cleanupPending.
- GET /projects/:id/prompts: Generation 기반 cursor pagination, prompt/settings/variationCount/status/trackCount/createdAt/generationId. 결과 없는 이력도 재사용할 수 있다.
- generation 그룹과 현재 재생 강조로 여러 결과를 빠르게 비교. track rename/delete modal, 삭제확정시요청전재생정지, rename은원본UUID경로보존·player제목동기화.
- prompt 복사·작성칸 재사용·원래 generation으로 이동. 작성중draft가있으면덮어쓰기확인. 지원하지않는설정은알림과함께제거하고새로운requestKey/sourceGenerationId로명시제출한다.
- completed 작업도 새작업재생성 가능하며 원본 이력은 불변. 모든track삭제후에도 generation과prompt이력을보존한다.
- 전역 favorite Library UI는 Phase9다. 이번 공통 PATCH에서 favorite boolean 저장계약도검증해이후중복endpoint를피한다.

## 소유

- 지휘: shared/contracts.ts, 문서/harness, 실제 UI QA·통합 검증.
- 제작 backend_bootstrap: backend/src/tracks/**, generations/**의prompt조회·serializer연동, app.module.ts 및 관련API회귀. storage/config변경은지휘에게제안한다.
- 제작 frontend_bootstrap: frontend/**. modal/composer/history/track조작과제어기동기화.
- 심사 지휘: 전체QA후 직접 구현하지 않은 backend 삭제/재사용 계약을 독립 검토한다. backend담당은frontend독립리뷰. provider_research는 별도 격리 공간에서 Phase8 구현을 병행한다.

## Decision Log

- 2026-10-01: TrackDetail은기존TrackSummary에requestedSettings와requestedVariationCount를추가한다. PromptSummary는generationId기준이며별도테이블/중복prompt저장을하지않는다.
- 2026-10-01: rename은trim1–120자,NUL거부;favorite은boolean만허용하며빈/알수없는PATCH필드거부. metadata수정과track삭제는소속project.updatedAt을transaction으로갱신한다.
- 2026-10-01: 비교는기존generation별결과카드의단일player전환을활용한다. 별도복잡한AB저장모델은도입하지않는다. 이력은새생성으로만늘어나며재사용이원본을수정하지않는다.

## 검증과 완료

두generation회귀,trackrename/downloadname/원본hash보존,favorite계약,DELETE/FK/파일실패보상/전체track삭제후이력유지,프롬프트cursor,다른project원본거부,기존draft덮어쓰기확인·복사·결과이동·새requestKey·재생성 검증. 실제1280/390px UI흐름,전체QA→독립리뷰→completed/review→commit→main병합/push→mergedbranch삭제.

## QA / Blockers

실제AI20곡은별도plan-004, Fal잔액부족/로컬키설정대기다. 이단계는Mock이력으로독립검증한다.

## 실행 근거

- 전체 `npm run qa`: 291 tests와 lint/typecheck/build/base/audio PASS(리뷰 수정 전).
- root backend 독립 리뷰: API 검증, UUID 원본 경로 보존, transaction 갱신·삭제, 파일 실패 보상, Generation 보존, cursor를 검토했다. 관련 16 tests 별도 PASS, 추가 finding 없음.
- 실제 IAB: 초안 덮어쓰기 취소/확인, 2개 결과 재생성, sourceGenerationId 보존·새 requestKey 확인, 재생 중 이름 변경과 player 제목 동기화, 삭제 취소/확정, 마지막 음원 삭제 후 0곡 이력 유지, 복사·결과 이동을 확인했다. 새로고침 후 기존 4곡과 5개 작업이 보존되었다.
- 1280×900/390×844 화면과 모바일 이름 변경 창을 시각 확인했다. 가로 넘침 없음. 스크린샷은 `/private/tmp/soundry-phase7-desktop.png`, `/private/tmp/soundry-phase7-mobile.png`, `/private/tmp/soundry-phase7-mobile-rename.png`다.
- frontend 독립 리뷰에서 첫 페이지 refresh 실패 후 오류 재시도가 이전 nextCursor를 따라 다음 페이지로 이동하는 P2를 발견했다. frontend 담당이 수정과 회귀 검증 중이다.

## 최종 QA와 리뷰

- 최종 `npm run qa`: 31 files / 294 tests, lint/typecheck/build/base/audio PASS. `UI_PORT=5174 npm run qa:smoke`: API/proxy/UI/포트 충돌/Ctrl-C 종료 PASS.
- 심사 backend_bootstrap의 frontend 독립 리뷰 P2 두 건을 수정했다. 오류 버튼은 항상 첫 페이지를 refresh하며, changeTrack은 진행 중 목록을 무효화한 뒤 polling/backoff를 재예약한다. 첫 페이지 실패→재시도, rename/delete 중 지연 응답→남은 작업 완료 회귀를 추가했다.
- 독립 재리뷰 관련 33 tests PASS, 추가 P1/P2 없음. backend의 root 독립 검토도 PASS다.
- Phase 7 범위 완료. 실제 90–180초 20곡과 실제 provider E2E는 plan-004/010에 미완료로 남긴다.
