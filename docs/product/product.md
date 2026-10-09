# Soundry 제품 범위

## 목표와 사용자

사용자 한 명이 자신의 컴퓨터에서 쓰는 AI Music Studio다. 프롬프트만으로 생성 요청을 시작하고 기존 결과를 들으면서 새 결과를 기다린다. 좋은 결과를 비교·보관·다시 생성·원본 다운로드하는 경험이 핵심이다.

첨부 사용자 기획 1–28항을 기준으로 한다. 2026-09-30 사용자의 전체 구현 요청으로 설계 승인 gate가 해소되었다. 아래 범위를 Phase별 계획과 QA·리뷰를 거쳐 구현한다.

## 핵심 흐름

프로젝트 선택 → 프롬프트 작성 → 선택 설정 → 생성 job → 결과 재생 → variation 비교 → 즐겨찾기 → 원본 다운로드. 재생성과 재시도는 새 Generation을 만들어 과거 이력을 보존한다.

## MVP 완료 범위

| 영역 | 필요한 동작 | 완료 기준 |
|---|---|---|
| Projects | 생성·목록·열기·이름 변경·삭제 | 이름, 생성/수정일, track 수; 재시작 후 유지 |
| Workspace | 프롬프트, Advanced Settings | 프롬프트만으로 생성, 공급자 미지원 설정은 비활성화 |
| Settings | Instrumental/Vocal, genre, mood, BPM, duration, seed, variations | 선택 입력; 지원 범위를 UI와 backend가 함께 검증 |
| Generation | queued/processing/completed/failed/cancelled | 즉각 접수, 비차단 상태 표시, 실패 재시도·취소 |
| History / Compare | generation별 묶음과 variation 목록 | 이전 결과 보존; 동시에 한 곡만 재생 |
| Track | 재생·즐겨찾기·이름 변경·삭제·다운로드·재생성 | 원본 파일과 메타데이터 일관성 유지 |
| Player | play/pause/seek/time/duration/volume | 화면을 옮겨도 단일 플레이어 유지 |
| Library | 모든 프로젝트의 favorite | 제목·프로젝트·길이·BPM·장르·생성일 표시, 미상 값은 미확인으로 표시 |
| Prompt history | 최근 prompt, 복사·재사용·결과 이동 | Generation 기반 조회; 별도 중복 테이블 불필요 |
| Export | 원본 오디오 다운로드 | 파일 확장자와 실제 포맷 일치; 이름 변경이 원본 경로를 바꾸지 않음 |

Mock만 있는 단계는 workflow MVP다. 실제 AI 작곡 완료라고 부르려면 Phase 8에서 실제 provider로 end-to-end 생성 검증을 통과해야 한다. 현재 선택한 CLI의 로그인·작곡·로컬 WAV 생성이 확인되지 않으면 이 부분을 미완료로 명시한다.

## 화면과 상태

- `/`: 랜딩페이지. `/projects`: 프로젝트 dashboard. 처음 사용, 빈 결과, 로딩, 오류 상태를 각각 제공한다.
- `/projects/:id`: prompt를 시각적으로 우선한 workspace, advanced settings, generation별 track 카드와 비교 목록.
- `/library`: favorite track 목록과 프로젝트 이동.
- 앱 하단 고정 player: 재생 곡과 진행·볼륨. 좁은 화면에서는 겹치지 않도록 콘텐츠 하단 여백 확보.
- 생성 버튼은 접수 중 중복 제출을 막고 job 접수 후 상태를 바로 표시한다. 생성 중에도 이전 곡을 들을 수 있다.
- 실제 진행률을 모르면 퍼센트를 만들지 않고 준비/생성/음원 저장 단계를 표시한다.
- track/project 삭제는 이름과 대상 범위를 보여주고 UI에서 확인한다. 진행 중인 project 삭제는 409로 막고 취소 후 다시 시도한다.

## 디자인

Dark, minimal, modern music studio. 검정·짙은 회색 배경, 읽기 쉬운 중립 텍스트, 제한된 강조색. desktop 우선으로 설계하되 모바일에서 sidebar를 접고 비교 목록을 세로로 배치한다. 과도한 gradient·glassmorphism은 쓰지 않는다.

키보드 focus, 버튼 label, 상태 안내, 충분한 대비를 포함한다. 생성 음원과 재생 조작이 중심이며 waveform·artwork는 후순위다. waveform을 넣으면 실제 오디오에서 계산하며 가짜 파형을 분석 결과로 보여주지 않는다.

## 제외 범위

결제 연동·구독 청구, cloud deploy/storage/CDN, analytics/telemetry, 원격 tenant 서비스, Docker 강제, Kubernetes, Redis/RabbitMQ, microservice, 피아노롤·실시간 합성은 제외한다. 2026-10-06 요청에 따라 로컬 회원·등급·관리자와 음원 클립의 다중 행 편집은 포함한다.

가사 생성, stem 분리, extend/remix/inpainting, reference audio, style/audio-to-audio/cover, BPM/key 분석, prompt enhancement, Tauri 패키징은 미래 후보이며 선구현하지 않는다. 보컬 모드는 선택한 provider가 지원할 때만 사용한다.

## 2026-10-06 확장 범위

랜딩(`/`) → 회원(`/account`) → 프로젝트(`/projects`) 흐름. 상품(`/pricing`)은 Free 10곡/월, Plus 100곡/월, Pro 500곡/월 안내이며 가격·결제 연동은 없다. 첫 회원은 관리자이며 기존 프로젝트를 인계받는다. 이후 회원은 Free이고 관리자가 등급을 지정한다. 모든 회원의 프로젝트·이력·오디오는 소유자만 접근하며 관리자도 다른 회원의 프로젝트를 자동 열람하지 않는다.

비트 편집은 프로젝트 음원을 클립으로 배치한다. 긴 기본 A 위에 B/C/D/E를 서로 다른 행·시점에 겹친다. 하단 행 추가, 클립 드래그 이동·길이 조절, 숫자 구간 편집, 원본 반복, 볼륨·행 음소거, 복제·행 이동·삭제, 저장·미리듣기·stereo WAV 내보내기를 지원한다. 최대 32행·128클립·600초이고 미리듣기/내보내기는 서로 다른 원본 8개·원본 합계 600초까지다. 실제 생성 원본은 변경하지 않는다.

사용량은 한국 시간의 달력 월 기준으로 접수 variation 수를 예약한다. completed는 유지하고 failed/cancelled는 복원한다. 같은 requestKey 재전송은 추가 차감하지 않는다. 프로젝트·음원 삭제로 생성량이 복원되지 않는다. 관리자 앱 생성량은 무제한이며 CLI 계정의 한도와 기존 작업 큐·안전 제한은 별도로 유지한다.

## 작곡 기억 확장 — 2026-10-09

사용자 요청으로 작곡 지식·청취 평가 RAG와 추후 Gemma 로컬 작곡 모델 교체, 악보 JSON/MIDI 내보내기를 포함한다. 후속 요청에 따라 보컬·음색용 모델 도입은 제외한다. 기존 연주 합성은 작곡을 들어보는 용도다. 작업 공간의 작곡 노트에서 지식 관리/청취 평가/참고 출처/악보를 제공한다. RAG는 검색 기억이며 자동 가중치 학습·판매 품질 보장은 아니다. [작곡 기억 설계와 품질 gate](../architecture/composition-memory.md)를 따른다.

## 제작 스튜디오 확장 — 2026-10-09

Live 기능/UI 흡수 요청에 따라 [조사·통합 지도](../references/ableton-live-research.md)를 기준으로 제작 환경을 확장한다. 첫 구현은 원본 검색, Arrangement/클립 런처, BPM 기반 편집 snap, 비반복 클립 분할,50단계 undo/redo,행별 volume/pan/mute/solo/Low-pass/Delay,clip fade와 실제 원본 파형이다. 원본 변경 없이 로컬 preview/offline stereo WAV export를 수행한다. BPM은 편집 격자 기준으로 오디오 속도를 바꾸지 않는다. 모든 Live 기능의 동등 구현은 미완료다. 후속 MIDI/automation/audio/native 단계는 로드맵의 독립 gate를 따른다.

## 작곡 품질 복원 — 2026-10-09

Gemma의형식유효성위주6음표/짧은패턴 제한을제거하고화성계획과6구간의개발된프레이즈로전환한다. 같은합성기를사용하는CLI/Gemma를동일공개brief·BPM·길이·seed·장르guidance로비교한다. 코드QA·구조지표와최종청취판정은구분한다. 로컬품질작곡은실제수분이상걸리므로한번에1곡을접수하고기본/과거2곡초안을UI에서1곡으로조정한다. 기존2곡요청키재전송은과거작업조회계약을유지한다.

## 원본 스타일 유지와 선율 다듬기 — plan-023

llamacpp에서같은프로젝트의완료작업입력을가져오면첫완성canonical악보가있는경우`reference-v3`를사용한다. 원본의장르·BPM·길이를유지해야하며불일치는추론전에400으로거부한다. 원본참조해제로독립`sectional-v2`작곡을선택할수있다. mock/실패/다른프로젝트참조는스타일악보가될수없다. 다른공급자에는참조악보를자동전송하지않는다.

원본편성·구간·리듬·gate·강약·mix·bass/drums/pad/organ·동시화음과보호악기의공유패턴을유지한다. 단선율slot에실제반주pitchclass를제공하며프레이즈마지막pitch를anchor로보존한다. Gemma가새pitch초안후polish를작성하고최종후보가잘못된경우한번만repair한다. 최소1/3의slotpitch를변경해야하며원본을변경하지않는다. 반환출처는reference-v3로기록하고새선율변주임을화면과패키지에표시한다. 전체편곡또는전체음표를Gemma독립작성으로표시하지않으며음악성동등성은청취로별도판단한다.
