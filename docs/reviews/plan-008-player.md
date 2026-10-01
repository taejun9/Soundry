# plan-008-player 리뷰

## QA 근거

- 최종 `npm run qa`: 258 tests와 lint/typecheck/build/base/audio PASS. `UI_PORT=5174 npm run qa:smoke` PASS.
- compiled 앱의 외부 cwd/독립 data root에서 생성한 원본 SHA·attachment bytes·Range206·HEAD metadata 확인.
- 실제 IAB에서 시간증가, pause, seek, volume, 다른곡전환, Library route 재생 유지, ended/재생완료, clear 확인. 실제 다운로드는 demo-02와 SHA256동일하며 QA 임시파일로 옮겼다.
- 1280×900·390×844 가로넘침 없음, player 높이만큼 spacer가확보되어문서끝콘텐츠가가려지지않음. 화면 `/private/tmp/soundry-phase6-desktop.png`, `/private/tmp/soundry-phase6-mobile.png`를 시각검사했다.

## 독립 리뷰와 수정

심사 provider_research: 큰 음원 응답을 멈춘 client가 Nest HTTP 종료와 DB owner 해제를 막는 P2를 재현. root가 forceCloseConnections와100MiB stalled-stream shutdown 회귀를추가했다. 동일compiled재현에서1초내HTTP종료·FDclose·DBlock해제확인, 관련43 tests 독립PASS.

심사 backend_bootstrap: 프로젝트 삭제 성공응답뒤에만재생정리를수행하여 응답유실·route이탈에서삭제된곡재생이남는P2를발견. frontend가삭제확정직후clearProject를DELETE앞에적용. 대기/유실/abort/다른project유지회귀포함17tests 독립PASS. dialog열기·취소는정지하지않는다.

두 재리뷰에서 추가P1/P2 없음. Phase6 PASS.

## 잔여 범위

Track rename/delete·prompt history·favorite·실제provider·Library는후속Phase다. 재생검증은자체제작8초Mock이며음악적품질청취나요청한90–180초실제AI20곡제작을완료했다는뜻은아니다. 실제20곡은잔액/키blocker가있는plan-004에유지한다.
