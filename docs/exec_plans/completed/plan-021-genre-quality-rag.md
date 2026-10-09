# plan-021-genre-quality-rag

## Status
completed

## Owner
project_lead / plan_keeper

## User Request
16개 지원 장르의 작곡 품질 검증, RAG 충분성 점검·확충, Downloads SoundCloud 업로드 준비. 추가로 같은 네트워크 Windows에서 맥북 서버에 접속하도록 구성.

## Goal
실제 Gemma 생성과 음악·신호 근거를 기록하고 장르별 업로드 WAV/악보/MIDI/metadata를 준비한다. 중복 없는 로컬 작곡 지식을 확충한다. 인증을 유지하는 명시적 LAN 접속을 제공한다.

## Non-Goals
보컬·음색 모델, SoundCloud 업로드, Suno 우월성 또는 상업적 음악성 보장, 인터넷 공개, 원격 AI 자동 호출.

## Constraints
관리형 worktree/codex branch. 개인 자료·음원·DB·환경값은 Git 제외. LAN 변경은 사용자가 명시 승인. Gemma 8089는 계속 loopback. QA→리뷰→main push→정리.

## Implementation Plan
- [x] 현재 RAG 중복·장르 coverage와 생성 계약 audit
- [x] 독자 작성 장르 지식 확충·검색 검증
- [x] 실제 16장르 생성/신호·구조 QA와 Downloads 패키지
- [x] 명시적 LAN 웹 접속·인증·호스트 경계 설정
- [x] QA·별도 리뷰·완료 기록과 Git lifecycle

## QA Plan
기존 전체 QA와 smoke, RAG 중복·소유권·검색 회귀, LAN host/origin/auth tests. 실제 Gemma 모든 지원 장르, WAV 검사·SHA·중복·JSON/MIDI·metadata 확인. 청취와 Windows 실제 조작은 수행 여부를 구분한다.

## Review Plan
QA 후 입력·소유권·네트워크·공개 metadata 경계와 요청 충족 별도 검토.

## Decision Log
| date | decision | reason |
|---|---|---|
| 2026-10-09 | 앱 지원16장르/기본120초, 객관적 구조·신호와 청취 평가를 구분 | 모든 장르의 무한 범위를 피하고 실제 검증 근거 제공 |
| 2026-10-09 | 장르별6개 독자 작성 지식96건, rating null/전송false로 저장하고 검색 중복을 억제 | 실제 사용자 RAG0건과 검증용 중복5건 확인 |
| 2026-10-09 | 명시적four-on-the-floor요청은d1에1마디4박킥과verse/chorus사용을검증하고House를재검사 | 초기House의quarter킥coverage13.7%로명시적리듬요구미충족확인 |
| 2026-10-09 | 인증된각회원이기본96건을명시적으로추가하는멱등import버튼/API제공 | Windows새계정도동일한공개기본자료를활용하고개인지식격리유지 |
| 2026-10-09 | 초기4곡중3곡의요청타악기누락을확인해타악기필요시4멜로디+2드럼후보·낮은베이스역할·옥타브전조·중심구간드럼검증추가후전수재시작 | 구조유효만통과한장르누락을숨기지않고개선 |
| 2026-10-09 | 실제16개 악보·SHA 재검증 뒤 장르별 자동 구조 관찰16건도 rating null로 별도 축적 | 관찰 사실과 인간 청취 승인/가중치 학습을 구분 |
| 2026-10-09 | 전용 데이터·장르별최대3개 명시적 시도와 checkpoint를 사용 | 실패 이력을 보존하고 모든 장르의 실제 생성 결과 확인 |
| 2026-10-09 | LAN은 웹 UI/proxy만 명시적으로 열고 Gemma와 DB는 로컬 유지 | Windows 접속 승인과 로컬 AI 데이터 경계 유지 |

## Progress Log
| date | role | note |
|---|---|---|
| 2026-10-09 | 설계 | 격리 worktree와 plan 생성, LAN 요청 포함 |
| 2026-10-09 | 검증 | 16곡/104파일/112지식/528tests와실제LAN PASS, 청취/Suno우위미검증 |
| 2026-10-09 | 심사 | QA후소스·소유권·공개산출물·범위별도검토PASS |

## Completion Notes
16장르의실제Gemma120초결과/총19회기록된최종시도와초기probe를보존하고104파일의업로드패키지를Downloads에정리했다. 독립전수WAV/MIDI/악보/SHA/출처PASS. RAG0→96기본guidance→112(자동구조관찰16)건,외부전송false/평점null. 기본자료계정별importUI/API와LAN정적gateway완료. 53files/528tests·Node18/Python24·lint/type/build/base/audio/smoke PASS,합성UI추가/중복검사PASS. 별도소스/데이터/산출물리뷰후완료mirror. 짧은패턴/4/4한계와판매/Suno/청취/실Windows미검증을QA기록과패키지에명시했다.

main병합/push후worktree사용프로세스를정리하고primary에서API/LAN을복원한다. 관리형worktree는detach/병합branch -d후archive하고임시caffeinate를해제한다. 실제기록은Git/최종보고로확인한다.
