# plan-018-screen-music-qa 리뷰

## 판단
PASS. QA 후 별도 소스·요청 충족·산출물 검토에서 추가 P1/P2를 발견하지 않았다. 이번 검토는 동일 작업 agent의 QA 이후 별도 검토 단계이며 다른 독립 agent를 실행한 것으로 기록하지 않는다.

## 변경과 이유
기존 제작·패키징 도구가 20곡만 허용해 10곡 요청을 처리할 수 없었다. 연속 번호 1–20곡을 허용하고 선택/완료 번호와 개수·중복 SHA 검증, checkpoint/input/공급자/원본 바이트 보존·실패 중단을 유지했다. 생성 프로젝트 이름과 패키지 안내도 실제 계획 개수로 표시한다. 별도 10곡 콘셉트 계획과 사용법·실제 QA·공식 업로드 규격 재확인 기록을 추가했다. 회원 구현과 모순된 README의 로그인 제외 안내를 현재 로컬 회원 범위로 바로잡았다.

## 근거
- fresh npm ci, 앱 43 files/456 tests, 음악 Node18/Python23와 lint 0 warnings·strict 타입·frontend/backend build·base·Mock WAV PASS.
- 개발 smoke API/proxy/UI·포트 충돌·Ctrl-C 후 포트 해제 PASS.
- 10곡 계획의 전체 접수·원본 확인·중복 제출 없는 재개·계획 밖 선택 거부. 빈/과대/중복/누락 계획을 HTTP·상태 저장 전에 거부하는 회귀 PASS.
- Python의 대역 없는 10곡 원본 유지 패키징, 번호/완료 불일치 preflight와 SHA·안내 검사 PASS. 기존 20곡 변환/보존 경계도 유지.
- [실제 화면 및 전달 파일 검증](../quality/plan-018-verification.md): 회원/소유권/사용량/편집/다운로드/재시작/반응형, Chrome 믹스 파일과 Safari 재생의 구체적 범위 기록.
- 실제 CLI 10곡 모두120초·고유 SHA10·신호 경고0·클리핑0. 앱 원본/Provenance/Upload SHA 동일, 독립 inode/nlink1 전수 확인. 전곡 실제 화면 재생 PASS.

## 경계와 제한
사용자 기존 DB·음원을 변경하지 않고 QA와 요청 제작에 별도 데이터 root를 사용했다. 실제 파일·DB·회원 인증/세션은 Git이나 공개 생성 provenance에 포함하지 않았다. 실제 테스트 회원 인증은 일회성 도구의 메모리 세션에만 사용하며 앱 인증 경계를 변경하지 않았다.

현재 provider의 결과는 AI 악보를 로컬 악기로 합성한 instrumental이다. 음색 청취·장르 적합성·LUFS·true peak는 평가하지 않았으며 신호 검사·브라우저 재생을 청취 평가로 바꾸어 기록하지 않는다. IAB Blob 저장 제약은 Chrome의 실제 다운로드와 독립 WAV 검사로 검증했다. 영구 삭제 버튼은 실제 확인창/취소까지만 수행하고 삭제 자체는 자동 API·파일 회귀 검증 근거를 따른다.

## 완료 연결
completed 계획과 같은 basename으로 mirror한다. 승인된 lifecycle에 따라 task commit 후 main 병합·push·병합 브랜치 삭제·관리형 archive를 수행한다. 요청한 WAV와 생성 데이터는 worktree 밖의 영속 위치에 있다.
