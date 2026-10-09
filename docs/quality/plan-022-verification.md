# plan-022 제작 스튜디오 검증

## 범위

공식 Live12 자료 조사 후 첫 오디오 제작 통합(A단계)과 앱 지원16장르 전수 새 엔진 export. 전체 Live 기능 동등성은 미완료이며 [기능별 현황·후속단계](../references/ableton-live-research.md)에 명시했다. 새 작곡 호출은0회다. 오늘 plan021의 실제 Gemma16장르 결과를 변경 없이 읽어 새 믹스를 만들었다.

## 코드와 서버 QA

- `SOUNDRY_PYTHON=<bundled NumPy Python> npm run qa`: 최종 lint/strict typecheck,54files/535tests,frontend/backend production build,base/audio,음악 Node18/Python24 검사 PASS.
- 기존 arrangement JSON 저장·restart 회귀 PASS. 확장 필드의 실제 API round-trip·회원간404·범위/형/unknown field/fade 합계 오류400·거부 후 원본값 유지 PASS.
- 편집 split의 gapless source offset/외곽 fade,loop split 거부,snap,독립50단계 history/redo 분기,Session 위치 원본 불변,mute/solo,seek fade,headroom/채널비율/NaN 경계 검사 PASS.
- `npm run qa:smoke`: 격리Mock data,API/Viteproxy/UI/포트충돌/Ctrl-C후 포트해제 PASS. 기존 진행 중 생성0건을 먼저 확인하고 기존API/UI/LAN을 잠시 정상 종료했다 복원했다. Gemma8089는 유지했다.
- `git diff --check`와 staged base 검사는 완료 기록에 반영한다.

## 실제 Chrome UI와 신호

`studio-browser-qa.mjs`를 프로젝트 backend tsconfig와 명시한 로컬 Playwright/설치Chrome으로 실행했다. 개인 프로필과 분리된 브라우저·임시 합성 회원/Mock 프로젝트·31306테스트API를 사용했다. API 연결만 테스트 HTTP route로 전달했고 실제 UI/AudioContext/OfflineAudioContext/WAV download를 실행했다. 실제 사용자DB/계정/음원을 화면 fixture에 사용하지 않았다.

- 실제 클립 선택·복제·undo/redo·4초 위치 분할·저장·reload: 클립2개 유지 PASS.
- 실제 원본 왼쪽채널 peak 파형,Session 장면 preview/stop,PCM16stereo WAV 생성·download PASS.
- 원본 검색0건/복원,Low-pass12000Hz/Delay0.25초 저장·reload,root Space재생/정지 PASS.
- 1440px/390px에서 document 가로 overflow 없음. 전체 스튜디오 screenshot을 직접 확인했다. 시각 QA에서 믹서 선택이 공백으로 표시되는 문제를 고쳤고 실제 선택UUID와 재로드를 다시 확인했다. timeline은 의도한 내부 가로 스크롤이다.
- 실제1kHz신호에서 pan -1의오른쪽무음/gain0.5의energy0.25/mute무음/100HzLow-pass의감쇠 PASS. impulse로250ms딜레이1회·500ms반복echo없음 PASS. feed-forward graph와WAVheader를실제브라우저에서검사했다.
- Browser harness 초기 failures는 backend decorator 설정 누락,소스/API경로 혼동,Nodefetch의Host처리였다. TSX설정·API절대경로·node:http수정후전수통과했으며 제품 guard를 약화하지 않았다.

## 16장르 실제 export와 Downloads

Hip-hop,Trap,R&B/Soul,Pop,Rock,Funk,Jazz,House,Techno,Drum&Bass,Ambient,Cinematic,Acoustic/Folk,Classical,Latin,Reggae/Dub 전수 검사했다. 원본SHA와 canonical score·genre preset 순서를 확인하고 공통scheduleMix로120초씩 실제 Chrome offline render했다. source는기존Gemma16개이며 새AI생성이나16개Mock결과가아니다.

mix recipe:60초에서gapless분할,18kHzLow-pass,250ms단일Delay/wet8%,행volume1/pan0/master80%,첫10msfade-in/마지막1초fade-out. 원본곡의다른곡으로의변환을장르검증이라고표시하지않는다. sample peak기준필요할때만-1dBFS감쇠이며이번16곡은추가감쇠0dB였다.

`package_studio.py`는 독립Python전수WAV decode/신호검사·원본SHA·MIDI type1/480PPQ/chunk/VLQ/notes on-off/EOT·악보장르·public metadata·복사본SHA를검사했다. 결과16곡/102파일/경고0,모두120초/stereo/44100Hz/PCM16,서로다른SHA16개. sample peak범위-3.135~-2.405dBFS. 총32분. 기존Downloads패키지를덮어쓰지않고새 `Soundry_Studio_16Genres_2026-10-09`에정리했다.

폴더:Upload_WAV16곡,Provenance원본16곡+처리16JSON,Scores16JSON+16MIDI,Metadata각TXT16개/CSV/JSON,Quality검증JSON·보고서·빈청취평가CSV,업로드안내TXT. 합성UI파일은포함하지않는다. MIDI는원본악보로오디오이펙트를담지않음을보고서에명시했다. 테스트데이터/음원/스크린샷은ignored data와Downloads에보존한다.

## 수행하지 않은 검증

사람의실제청취·음악성/판매품질/권리승인·Suno비교·true peak/LUFS·외부DAWimport·실Windows조작·Safari/WebKit·실제SoundCloud업로드는미수행이다. 현재작성모티프/4/4/기존합성음색의한계는이전품질보고서와패키지에유지한다. 전체Live동등성/악기·기기별모든파라미터감사는미완료다.
