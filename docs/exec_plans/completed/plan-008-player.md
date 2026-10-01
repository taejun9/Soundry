# plan-008-player

## 목표와 범위

Phase 6: 저장된 음원을 실제 브라우저에서 듣고 탐색하며 원본을 다운로드한다. Phase 5는 bec4760으로 main 병합·push했다. 관리형 앱 worktree를 재사용한다.

- GET/HEAD track audio/download: 실제 원본 bytes, MIME·length·Accept-Ranges, 단일 Range206/unsatisfiable416/multiRange200, 안전한 filename, 누락·경로탈출 오류.
- app shell 단일 HTMLAudioElement, play/pause/seek/volume/시간·오류, 현재 track 표시, route 이동 재생 유지. 수동 재생만 허용한다.
- 모든 generation track 카드에 재생·원본 다운로드를 연결하고 하단 player가 좁은 화면의 콘텐츠와 겹치지 않게 한다.
- 실제 IAB에서 재생 시간 증가·seek·pause·다른 track 전환·route 이동·ended, 다운로드 bytes를 검증한다.
- rename/delete/favorite/Library와 prompt history는 다음 단계에 유지한다.

## 소유

- 지휘: 문서·shared JSON 계약 조정·실제 화면 QA·최종 통합 검증.
- 제작 backend_bootstrap: backend/src/tracks/**, backend/src/app.module.ts 및 필요한 app/API 테스트. 기존 storage/config 변경 필요 시 지휘에게 제안한다.
- 제작 frontend_bootstrap: frontend/** 전체. 단일 audio controller와 회귀, player/card UI를 구현한다.
- 심사 provider_research: QA 이후 backend stream/경로/Range 독립 검토. frontend는 backend 담당과 지휘가 QA 이후 독립 검토한다.

## Decision Log

- 2026-10-01: download endpoint는 audio stream과 같은 파일 검증·Range 구현을 공유하므로 Phase 10의 원본 다운로드를 이번 단계에 연결한다. 최종 export UX QA는 Phase 10에서 다시 확인한다.
- 2026-10-01: Range는 단일 byte 범위만 지원한다. malformed/multiple은 full200, 유효하지만 범위밖은416. 파일을 FD로 열고 확인한 뒤 같은 FD를 stream해 검사 후 경로 교체로 다른 파일을 읽지 않도록 한다.
- 2026-10-01: play promise와 source 교체 경쟁은 token으로 보호하고 이전 source 이벤트가 새 상태를 덮지 않게 처리한다. metadata가 없는 duration은 임의 계산하지 않는다.

- 2026-10-01: [RFC 9110 §14.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-14.2)에 따라 HEAD의 Range는 무시하고 전체 length·200·빈 body를 반환한다. bytes=10-9는 malformed→200, bytes=N- 또는 bytes=-0는 valid unsatisfiable→416이다.
- 2026-10-01: [HTML media load algorithm](https://html.spec.whatwg.org/multipage/media.html#media-element-load-algorithm) 및 [MDN play](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)·[load](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/load)를 확인했다. load()가 pending play를 AbortError로 중단하므로 play promise 해결 여부와 현재 source/request token을 함께 확인한다.

- 2026-10-01: validator를 제공하지 않는 현재 stream은 If-Range가 있으면 전체200으로 처리한다([RFC9110 §13.1.5](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.5)). 다운로드명은 ASCII fallback과 RFC8187 UTF-8 filename*를 병행하고 실제 포맷 확장자를 사용한다. HEAD/416/연결중단도 열린 FD를 닫는다([Node24 FileHandle](https://nodejs.org/docs/latest-v24.x/api/fs.html#filehandlecreatereadstreamoptions)).

- 2026-10-01: 독립 리뷰에서 느린 다운로드가 HTTP close와 DB lock 해제를 막는 P2를 재현했다. Nest의 forceCloseConnections를 활성화해 shutdown이 진행 중인 client 연결을 닫고 pipeline이 FD를 정리하도록 한다. root 소유 범위에 app.ts와 app-shutdown.test.ts를 추가한다. 설치된 Nest adapter의 close→closeOpenConnections→httpServer.close 및 core shutdown 순서를 직접 확인했다.

## 검증과 완료

원본 byte/hash·Range/HEAD/attachment·파일 누락·symlink/hardlink·삭제 중 stream, audio play promise 경쟁과 pause/ended/error, 실제 화면/키보드/반응형 검증. 전체 QA→독립 리뷰→completed/review→commit→main 병합/push→merged branch 삭제를 따른다.

## QA / Blockers

실제 AI 테스트곡 제작은 별도 plan-004이며 Fal 잔액 부족·앱 키 준비와 무관하게 이 단계는 Mock 원본으로 검증한다.

- backend 전체186 tests와 frontend67 tests, 최종 `npm run qa` 253 tests·lint/typecheck/build/base/audio PASS.
- compiled production 앱을 `/private/tmp` cwd와 독립 data root에서 실행하여 생성→원본 GET/attachment SHA동일(1,411,244 bytes)→Range206 정확한44bytes→HEAD200/full length/body0 PASS.
- 실제 IAB: 0:00→0:04 시간증가, 종료→재생버튼, 재생직후 pause, 2초/3초 seek, volume35%/40%, 다른 track 전환 후 Library route에서도 재생유지, clear 확인. ended 문구를 '재생 완료'로 개선하고 종료 후 seek는 '일시 정지'로 복귀함을 재검증했다.
- 실제 브라우저 다운로드는 `demo-02.wav`와 SHA256 952c8ae96a5d0286f9f22f636c304e243f71e7702759665afbd0bf9749a7066c 동일. 검증용8초파일을 요청한 실제음원과 혼동하지 않도록 `/private/tmp/soundry-phase6-browser-download.wav`로 이동했다.
- 1280×900 및390×844에서 scrollWidth=viewportWidth. 모바일 player159px와 spacer159px, 문서끝 footer는player위에서끝남을확인했다. `/private/tmp/soundry-phase6-desktop.png`, `/private/tmp/soundry-phase6-mobile.png`를 직접시각검사했다.
- 사용자 기본 checkout에서도 `npm ci` 성공, 설치 audit0 vulnerabilities. API키값은읽거나출력하지않고 설정여부만 확인했으며 아직미설정이다.

- 독립 backend 리뷰 P2: 100MiB 음원 client가첫chunk뒤pause하면app.close/FD/DBowner가6초뒤에도남았다. forceCloseConnections:true를적용하고shutdown회귀를추가했다. 동일compiled재현에서1초이내closed=true/streamClosed=true/dbStillOpen=false로수정확인. 관련43 tests독립재실행PASS.
- 독립 frontend 리뷰 P2: projectDELETE응답유실또는unmount면성공후에만연결된재생정리가누락됐다. 삭제확정직후동기clearProject→DELETE순서를보장하고대기/유실/abort/다른project보존4개회귀추가. 관련17tests독립재실행PASS. dialog열기·취소는재생을유지한다.
- 수정후 최종 `npm run qa`:258 tests·lint/typecheck/build/base/audio PASS. `UI_PORT=5174 npm run qa:smoke` API/proxy/UI·충돌·Ctrl-C포트해제PASS. backend/frontend독립재리뷰남은P1/P2없음. Phase6완료.
