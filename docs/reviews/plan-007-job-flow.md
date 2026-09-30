# plan-007-job-flow 리뷰

## QA 근거

- 최종 `npm run qa`: 198 tests, lint/typecheck/build/base/audio PASS.
- `UI_PORT=5174 npm run qa:smoke`: API/proxy/UI·포트 충돌·Ctrl-C 종료 PASS.
- production HTTP: 202→동일 key 200→실제 8초 WAV 4개→재시작 보존→project 삭제와 파일 정리 PASS.
- 실제 IAB: 진행 중 취소, 명시 재시도, 다른 route 이동 중 완료, backend 강제 중단 후 offline 재조회와 SERVER_RESTARTED 복구, 새로고침 이력 보존 확인. 1280×900·390×844 가로넘침 없음. 화면 근거는 `/private/tmp/soundry-phase5-desktop.png`, `/private/tmp/soundry-phase5-mobile.png`.
- 별도 Node process의 중복 DB owner 차단과 in-flight 파일 보존, owner 종료 후 stale/orphan 정리 확인.

## 독립 판단과 수정

심사 provider_research: job/API 43 tests 및 실제 WAV batch의 완료 UPDATE 강제 실패→DB track0/audio0/temp0→다음 FIFO 정상 완료를 독립 검증. PASS.

심사 backend_bootstrap: frontend 취소 응답보다 terminal poll이 빠를 때 늦은 취소 오류가 남는 P2 발견. frontend 담당 수정 후 terminal 3종과 pending 오류 표시 회귀 포함 13 tests를 재검토해 PASS.

심사 frontend_bootstrap: temp generation 폴더가 symlink로 교체되면 외부 파일을 cleanup이 지울 수 있는 P2 발견. 지휘가 폴더와 파일 dev/ino 소유권 확인, 검사 FD 대조, 안전한 temp 정리 경로 분리를 추가했다. throw/abort/finish 교체 및 regular part 교체 회귀를 포함한 31 tests 재실행과 코드 재검토 PASS.

남은 P1/P2 없음. Phase 5 PASS.

## 잔여 범위

플레이어·Range·다운로드는 Phase 6 이후다. 현재 결과는 자체 제작 고정 8초 Mock이며 실제 AI 곡이나 사용자 요청의 90–180초 테스트곡 20개가 아니다. Fal 잔액 부족과 앱 키 설정 대기 상태는 별도 plan-004에 유지한다.
