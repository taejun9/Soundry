# plan-012-release-polish 리뷰

## 변경과 QA

긴 입력 설명과 음원 metadata를 줄바꿈하고 플레이어 공급자 표시를 말줄임 처리했다. 모바일 재생 상태는 별도 줄로 유지한다. README에 첫 사용·초안 보존 한계·전체 data 백업·오류 해결을 기록하고 출시 체크리스트에 완료 범위와 실제 생성 gate를 구분했다.

fresh npm ci는 Node v24.15.0/npm 11.12.1에서 298개 설치, 301개 audit, 취약점 0, lockfile 변화 없음이다. 최종 npm run qa는 37 files/356 tests와 lint/typecheck/build/base/audio PASS. UI_PORT=5174 npm run qa:smoke는 API·proxy·충돌·Ctrl-C 종료 PASS.

격리 compiled API E2E에서 2 jobs×2 WAV, 같은 requestKey 접수, 즐겨찾기·한글/emoji 제목·프로젝트 수정, 원본 SHA256/Range/HEAD, 서버 재시작 후 DTO·이력·파일 보존을 확인했다. 이 신규 E2E는 삭제를 수행하지 않았고 삭제 근거는 Phase 7·9를 따른다.

IAB 320px에서 4000자 prompt 생성/이력 펼침, 120자 제목과 재생, 문서 끝 실제 스크롤을 확인했다. 가로 넘침이 없고 player/spacer 각166px이며 마지막 카드가 가려지지 않는다. 화면 근거는 /private/tmp/soundry-phase10-mobile-long-title.png 및 soundry-phase10-mobile-bottom.png다.

native Chrome 별도 탭에서 보관함·재생·0.6초 위치·일시 정지, native Safari 별도 탭에서 보관함·재생·일시 정지·4초 seek를 확인했다. 확인 범위를 다른 동작으로 확대하지 않는다. QA 탭은 정리했고 native 화면 자료는 개인 브라우저 UI를 포함하므로 로컬 QA용으로만 보관한다.

primary .env 부재 확인 후 비밀 없는 Mock/UI_PORT5174 설정을 exclusive create/0600으로 만들었다. npm run dev 준비 완료와 IAB의 빈 프로젝트 첫 화면·로컬 서버 연결을 확인했다. 기본 사용자 data에 QA 데이터를 넣지 않았다.

## 독립 리뷰

backend_bootstrap은 직접 구현하지 않은 표시 변경·접근성·README와 IAB 시각 근거를 검토했다. 원래 텍스트/aria-label과 ResizeObserver spacer 유지, 긴 글자 처리, 실제 확인 범위를 점검해 추가 P1/P2 없음으로 판단했다. 독립 diff/base PASS. 최종 README/checklist/plan 사실 문구도 재검토 PASS다.

## 잔여 범위

실제 Fal adapter는 별도 plan-010에서 구현·자동 검증했지만 실제 생성 gate 전이므로 main에 병합하지 않는다. plan-004의 요청 음원 20곡은 생성·다운로드·청취 각0곡이며 계정 잔액과 backend 키 준비를 기다린다. 자체 8초 Mock 파일과 합성 테스트 fixture는 요청 음원으로 세지 않는다. 전체 사용자 목표는 아직 완료되지 않았다.
