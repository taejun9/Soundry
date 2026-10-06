# plan-018 실제 화면 검증

확인일: 2026-10-06. 관리형 격리 worktree와 기존 사용자 DB와 분리한 로컬 테스트 저장소를 사용했다. 아래는 이번 실행에서 확인한 범위이며 모든 브라우저의 모든 입력 조합을 보장한다는 뜻이 아니다.

## 자동 QA

초기 fresh npm ci: 298 packages, 취약점 0. 앱 43 files / 456 tests, lint 0 warnings·타입·frontend/backend build·base·Mock WAV·음악 Node16/Python21 PASS. 개발 smoke의 API·Vite proxy·포트 충돌·Ctrl-C 후 포트 해제 PASS. 도구 확장 후 음악 Node18/Python23 PASS. 변경 후 최종 전체 QA도 앱 456 / Node18 / Python23, lint·타입·빌드·base·WAV 모두 PASS.

## 실제 화면 수행

| 영역 | 확인 결과 |
|---|---|
| 랜딩·상품·첫 사용 | 랜딩 CTA, Free10/Plus100/Pro500, 회원 설정 전 프로젝트 접근 시 가입 이동 PASS |
| 회원·세션 | 첫 관리자 가입, 두 번째 Free 가입, 로그아웃, 잘못된 비밀번호 오류, 재로그인·서버 재시작 세션 보존 PASS |
| 소유권·관리자 | Free 회원의 목록이 분리되고 다른 회원 프로젝트 직접 주소는 없음 표시. 관리자 Plus 지정 및 마지막 관리자 해제 오류 PASS |
| 사용량 | 실제 화면 4곡 예약·취소 복원, 취소 이력 입력 교체 확인 후 새 접수, 10/10 도달과 추가 요청 차단 PASS |
| 프로젝트 | 빈 이름 오류·초점, 생성, 이름 변경, 새로고침·재시작 보존 PASS. 삭제 확인창의 10곡 범위·취소 PASS |
| 작성·생성 | 빈 prompt 오류·초점, Hip-hop 예문, Mock 미지원 설정 비활성화, 2 variation 완료, 처리 중 화면 이동·취소·입력 재시도 PASS |
| 이력·프롬프트 | 원본 이력 보존, 재사용 확인창, 복사 성공 표시, route 이동 초안 복원 PASS |
| 플레이어 | 한 곡 재생·곡 전환·route 이동 유지, seek·volume 키보드, pause·ended, 이름 동기화 PASS |
| 보관함 | 즐겨찾기 추가·해제, 프로젝트 이동, 미확인 metadata, 재생 중 목록 해제·빈 상태 PASS |
| 편집 | A 24초 반복, B 원본 offset1/길이6, C 복제·이름·행 이동, 행 추가·음소거, 드래그 B 시작4→6/길이6→7, 저장·새로고침·서버 재시작 복원 PASS |
| 믹스 | 미리듣기 위치 증가, 원본 플레이어와 상호 정지, OfflineAudioContext WAV 렌더·Chrome 실제 저장 PASS |
| 원본 다운로드 | IAB 실제 Downloads 파일과 fixture SHA256 일치 PASS. 실제 CLI 첫 곡도 화면 다운로드 PASS |
| 연결 오류 | 서버 중단 시 작업 실패와 구분된 재조회·연결 끊김 표시, 서버 재시작 후 연결·회원·저장 복원 PASS |
| 404·메뉴 | 없는 경로의 404 안내·프로젝트 복귀, 320px 메뉴 열기와 상품 이동 PASS |
| 반응형 | IAB 1280×900,390×844,320×844에서 편집·하단 player 확인, 390/320의 document 폭과 viewport 일치, 320px 랜딩·상품·계정 폭 일치 PASS |

Chrome 게스트 창에서 기존 테스트 회원 로그인과 저장 편집본을 열고 Blob WAV를 실제 저장했다. 24.0초 / stereo / 44100Hz / PCM16 / 4233644 bytes, sample peak -4.713dBFS, 연속 full scale 0, 최장 저레벨 0초였다. 일반 음악 도구의 90초 하한 경고는 이 24초 QA 믹스의 의도된 길이 때문이며 요청한 완성곡에 포함하지 않는다. IAB는 원본 HTTP 다운로드는 성공했지만 Blob 믹스 다운로드 이벤트·디스크 저장은 실패했고 Chrome 검증으로 실제 파일을 확인했다.

실제 음원/프로젝트 영구 삭제는 화면 확인창·취소까지 확인했고 DB·파일 삭제·사용량 보존은 자동 통합 테스트를 따른다. Safari 별도 QA 탭에서 로컬 회원 로그인·첫 실제 CLI 곡 재생·약 32초 위치 탐색·일시 정지를 확인했다. IAB에서 확인한 전 기능을 Safari에서 반복한 것은 아니다. 실제 음색 청취·LUFS·true peak는 수행하지 않았다. QA 화면 자료와 DB·WAV는 Git에 넣지 않는다.

## 요청한 실제 10곡

별도 10곡 계획의 각 곡은 120초를 요청했다. 첫 곡은 실제 화면에서 CLI의 89초 오류 후 120초 접수·저장·재생·원본 다운로드·보관함·탐색·일시 정지를 확인했다. 이후 곡은 같은 테스트 회원 세션을 메모리에만 둔 로컬 API 배치로 제작했다. 10개 작업 모두 completed이며 실패·취소·추가 재생성이 없었다. 전곡을 실제 화면에서 각각 재생·정지했고, 마지막 곡의 320px 화면도 가로 넘침이 없었다. 실제 2분 곡의 End 탐색→재생 완료→0초 재시작을 확인했다.


10곡 모두 실제 120.0초 / stereo / 44100Hz / PCM16 WAV / 21168044 bytes, SHA256 고유값 10개, 연속 full scale 0, 신호 검사 경고 0이다. sample peak는 -0.9155~-0.9152dBFS이며 최장 저레벨 구간은 0.9초다. 원본 유지 방식으로 Downloads/Soundry_East_West_10_2026-10-06에 Upload_WAV 10개·Metadata 제목/설명/태그 TXT와 JSON/CSV·Provenance 원본과 생성/검사 JSON·안내문을 만들었다. 독립 wave reader로 포맷·길이를 확인했고 앱 다운로드 원본/Provenance/Upload의 SHA 일치, 각기 다른 inode와 nlink=1을 전수 검사했다. delivery-verification.json에 최종 결과가 있다.

실제 음색 청취 평가는 수행하지 않았다. 신호 검사와 화면의 재생 성공을 음악적 품질 평가로 표시하지 않는다. 보컬·기존 녹음 샘플을 생성한 것이 아니라 새로운 AI 악보의 로컬 합성 연주곡이다. SoundCloud 공식 WAV/stereo/16-bit44.1kHz/headroom 권장을 재확인했으며 SoundCloud 계정 업로드는 이번 범위에 포함하지 않는다.

| 번호 | 제목 | 참고 방향 | BPM | 길이 |
|---|---|---|---|---|
| 01 | Brownstone After Rain | 동부 붐뱁 | 88 | 2:00 |
| 02 | Velvet Ledger | 동부 붐뱁 | 92 | 2:00 |
| 03 | Midnight Borough | 동부 붐뱁 | 84 | 2:00 |
| 04 | Corner Office Groove | 동부 붐뱁 | 96 | 2:00 |
| 05 | Last Train Home | 동부 붐뱁 | 86 | 2:00 |
| 06 | Pacific Sunset Drive | 서부 G-funk | 94 | 2:00 |
| 07 | Concrete Sunrise | 서부 G-funk | 90 | 2:00 |
| 08 | Palm Avenue Bounce | 서부 G-funk | 100 | 2:00 |
| 09 | Letters To The Coast | 서부 G-funk | 82 | 2:00 |
| 10 | Westside Night Lights | 서부 G-funk | 104 | 2:00 |
