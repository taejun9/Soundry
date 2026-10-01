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

Mock만 있는 단계는 workflow MVP다. 실제 AI 작곡 완료라고 부르려면 Phase 8에서 실제 provider로 end-to-end 생성 검증을 통과해야 한다. 키나 모델 선택이 없으면 이 부분을 미완료로 명시한다.

## 화면과 상태

- `/`: 프로젝트 dashboard. 처음 사용, 빈 결과, 로딩, 오류 상태를 각각 제공한다.
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

회원가입, 로그인, 권한/사용자/tenant 관리, 결제·구독, cloud deploy/storage/CDN, analytics/telemetry, admin, Docker 강제, Kubernetes, Redis/RabbitMQ, microservice. DAW 시퀀서·피아노롤·실시간 합성·멀티트랙 편집도 제외한다.

가사 생성, stem 분리, extend/remix/inpainting, reference audio, style/audio-to-audio/cover, BPM/key 분석, prompt enhancement, Tauri 패키징은 미래 후보이며 선구현하지 않는다. 보컬 모드는 선택한 provider가 지원할 때만 사용한다.
