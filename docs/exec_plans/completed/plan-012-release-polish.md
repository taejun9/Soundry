# plan-012-release-polish

## 목표와 범위

Phase 10의 최종 Mock workflow 품질과 사용 준비를 완료한다. Phase 1–7·9는 main 9876ff6으로 push 완료했다. 실제 Fal 연동 gate 및 90–180초 20곡은 별도 active plan-010/004에서 키/잔액 준비를 기다린다. 이 작업은 이를 완료로 바꾸지 않는다.

- 설치·시작·프로젝트 생성·예문/생성·비교·재시작·즐겨찾기·원본 다운로드까지 누락 없이 검증한다.
- 실제 Chrome 및 Safari로 가능한 브라우저 QA를 수행하고 접근이 불가능하면 제한을 정확히 기록한다. 기존 IAB 1280/390px 및 각 Phase의 행동 검증을 근거로 함께 사용한다.
- 긴 입력·좁은 화면·키보드·오류 안내를 점검해 실제 확인한 UI/UX 문제를 수정한다. 새 product 영역·원격 기능은 추가하지 않는다.
- README의 첫 사용/실행 주소/백업/오류 해결을 정리하고 검증 행렬 및 미완료 범위를 docs에 기록한다.
- 사용자 primary checkout에서 npm 설치와 실행 설정을 준비한다. .env가 아직 없을 때만 비밀 없는 Mock/UI_PORT=5174 설정을 0600으로 생성한다. 기존 환경 파일은 덮어쓰지 않는다.

## 소유

- 지휘: 실행 계획, 실제 브라우저 QA, 최종 통합/사용 환경 준비.
- 검증 backend_bootstrap: 변경 없는 dependency로 fresh npm ci, 전체 QA와 임시 data root의 compiled API end-to-end 재시작/download hash 확인. backend 소스 변경이 필요하면 지휘에게 제안한다.
- 제작 frontend_bootstrap: frontend/**의 긴 입력·320/390px·키보드/접근성 점검과 필요한 수정. root가 브라우저를 사용하므로 동시 CUA 사용은 하지 않고 source 중심으로 먼저 점검한다.
- 정리 provider_research: README.md 및 docs/quality/release-checklist.md 사용자 실행/QA 행렬 초안. 나머지 문서는 지휘 소유다.
- 심사: QA 이후 구현하지 않은 담당자가 변경을 독립 검토한다.

## Decision Log

- 2026-10-01: 실제 provider 미검증을 숨기지 않는다. Mock workflow 준비와 실제 AI 생성 완료를 분리 보고한다. 상업적 이용 권리나 외부 과금 취소를 보장하지 않는다.
- 2026-10-01: 이 기기의 5173은 다른 앱이 사용 중이므로 Soundry UI는 5174를 명시한다. 다른 앱의 서버나 데이터를 건드리지 않는다.

## 검증과 완료

fresh install/build/QA, compiled 전체 흐름, 실제 IAB/Chrome/Safari 가능한 범위, 긴 입력/모바일/키보드, download bytes와 metadata 확인, README대로 실행. 실패는 blocker로 기록하고 gate를 임의로 통과시키지 않는다. QA → 독립 리뷰 → completed/review → main merge/push → branch 삭제 절차를 지킨다. 실제 provider/음원 blocker는 별도 active 계획에 남긴다.

## 실행 근거

- fresh npm ci: Node v24.15.0/npm 11.12.1, 298개 설치·301개 audit·취약점 0, lockfile 변화 없음. compiled 임시 HTTP E2E는 2 jobs×2 WAV, 같은 requestKey, favorite/한글·emoji 제목/프로젝트 수정, 원본 SHA·Range·HEAD, 서버 재시작 후 모든 DTO/이력/파일 불변을 확인했다. 스크립트는 `/private/tmp/soundry-phase10-compiled-smoke.mjs`이며 임시 DB/child를 정리했다.
- frontend는 긴 공급자·장르·설명 줄바꿈과 플레이어 공급자 말줄임을 보완했다. 모바일 상태를 별도 줄로 유지한다. 표시 변경이므로 구현을 복제하는 단위 테스트는 만들지 않았으며 실제 화면과 build로 검증했다.
- Chrome browser connector는 unavailable이었지만 native Chrome으로 별도 QA 탭에서 Library 조회·재생·0.6초 위치·일시 정지를 확인했다. Safari native도 별도 탭에서 조회·재생·일시 정지·4초 seek를 확인했다. native 연결이 한 차례 끊겨 재연결했다. 앱 설정을 변경하거나 다른 사용자 탭을 수정하지 않았고 QA 탭만 닫았다. 화면 `/private/tmp/soundry-phase10-chrome.png`, `/private/tmp/soundry-phase10-safari.png`는 로컬 QA용이며 사용자 브라우저 chrome을 포함하므로 공개 문서에 첨부하지 않는다.
- IAB 320px: 공백 없는 4000자 prompt로 1개 Mock 생성 후 이력 펼침, 120자 영문 제목 변경·재생 확인. width/scrollWidth 모두320, player/spacer166px. 문서 끝 실제 스크롤에서 footerBottom678.04와playerTop678로 마지막 카드가 가려지지 않는다. 버튼 문구도 정상이다. `/private/tmp/soundry-phase10-mobile-long-title.png`, `/private/tmp/soundry-phase10-mobile-bottom.png`를 시각 확인했다.
- primary .env가 없음을 확인하고 exclusive create/0600으로 Mock,UI_PORT5174,기본data,빈FAL_KEY 설정을 만들었다. 비밀값을 넣지 않았고 기존파일 덮어쓰기는 하지 않았다. primary main에서 npm run dev가 API3000/UI5174 준비 완료를 보고했고 IAB의 빈 프로젝트 화면과 서버 연결을 확인했다. QA 데이터는 기본 사용자 data로 복사하지 않았다.

- 최종 npm run qa: 37 files/356 tests 및 lint/typecheck/build/base/audio PASS. UI_PORT=5174 npm run qa:smoke PASS. 독립 심사 backend_bootstrap은 표시·접근성·README와 320px 화면을 검토해 추가 P1/P2 없음, diff/base PASS로 보고했다.

## 완료

2026-10-01 QA 이후 독립 리뷰 및 체크리스트 최종 사실 검토 PASS. Phase 10의 Mock 사용 흐름·표시 개선·설치/실행 안내 범위를 완료했다. 실제 Fal와 20곡은 active plan-010/004의 잔여 gate이며 전체 사용자 목표는 미완료다.
