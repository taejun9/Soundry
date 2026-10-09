# plan-022-live-studio

## Status
completed

## Owner
project_lead / plan_keeper

## User Request
Ableton Live의 모든 기능과 UI를 조사·정리 후 Soundry에 흡수 병합하고 모든 장르 테스트 음원을 Downloads에 SoundCloud 업로드용으로 정리한다.

## Goal
Live 12 공식 매뉴얼·에디션 표를 근거로 전체 기능군과 UI를 추적 가능한 단계로 정리하고 Soundry의 로컬 스튜디오를 실제 동작하는 편집·믹싱 흐름으로 확장한다. 현재 지원 16장르를 실제 파일·악보·편집 내보내기 기준으로 전수 검사하고 새 Downloads 패키지를 전달한다.

## Non-Goals
Ableton 바이너리·브랜드·번들 음원 복사, SoundCloud 자동 업로드, 클라우드·결제 연동. 완전한 DAW 동등성을 검증 없이 주장하지 않는다.

## Constraints
관리형 worktree와 codex 브랜치. No Exec Plan, No Work. 기존 데이터·원본 보존. QA→리뷰→완료 이동/mirror→main 병합/push→branch -d→archive. 외부 AI 자동 호출 없음.

## Implementation Plan
- [x] 공식 기능·UI 자료 수집과 기능군별 현황/후속 phase 정리
- [x] 현재 편집기·오디오 엔진·장르 패키지 audit
- [x] 편집/믹싱 핵심 기능과 스튜디오 UI 구현
- [x] 지원16장르 전수 실제 파일/편집 내보내기 검사와 Downloads 정리
- [x] QA·별도 리뷰·완료 기록과 lifecycle

## QA Plan
전체 npm qa/smoke. 프로젝트 소유권과 저장 호환성, 실제 오디오 scheduling·렌더링 동등성, 편집 상태 회귀와 keyboard/반응형 UI. 모든 지원 장르 WAV/JSON/MIDI/SHA/metadata 전수 검사. 청취·음악성·외부 DAW 동등성 미검증은 구분한다.

## Review Plan
QA 이후 기능 요구·호환성·데이터 경계·출처·음원 정합성 별도 판단.

## Decision Log
| date | decision | reason |
|---|---|---|
| 2026-10-09 | Live 12 최신 공식 매뉴얼/에디션 표의 모든 기능군을 조사하고 독자 구현 단계로 추적 | 소스 없는 상용 DAW를 실제 코드 merge할 수 없으며 누락/허위 완료 방지 |
| 2026-10-09 | 모든 장르는 현재 앱의 지원16개 preset으로 전수 검사 | 무한 장르 집합 대신 재현 가능한 범위와 실제 결과 제공 |

## Progress Log
| date | role | note |
|---|---|---|
| 2026-10-09 | 설계 | clean main·기존 artifact 없음 확인, 관리형 worktree 생성 |

## Completion Notes
A단계 완료: 공식 조사/전체 기능군 지도와 첫 오디오 제작 스튜디오 통합,535tests와전체QA/smoke,실제ChromeUI·신호검증,기존Gemma16장르의공통엔진전수export/독립WAV·SHA·MIDI검증을통과했다. Downloads새패키지102파일/16곡/총32분/경고0. 새작곡호출0회·사람의청취미수행. 전체Live동등성은미완료이며B/C/D후속단계를제품로드맵에명시했다. QA후별도소스/범위/데이터리뷰PASS. main병합/push/branch삭제/관리형archive는Git실행결과로확인한다.

## Research decisions before implementation
- Live의 Arrangement/Session·browser·mixer·clip inspector라는 공간 배치를 Soundry의 자체 UI로 적용한다. 피아노롤/네이티브 plug-in/Max/Push/warp는 현재 엔진에 없는 별도 단계이며 기능표에 미구현으로 남긴다.
- 첫 통합 범위: 검색 원본 browser, Arrangement/클립 launcher 전환, BPM 기반 snap/ruler, split/undo/redo/keyboard, 행 gain/pan/solo/low-pass/delay, clip fade, master gain, peak headroom export. 같은 scheduling 함수를 미리듣기와 offline export에 사용한다.
- 기존 arrangement JSON은 optional 확장으로 읽기·저장을 호환하며 서버에서 모든 새 필드와 범위를 검증한다. DB schema migration 없이 소유권 guard를 그대로 따른다.
- 오늘의 실제 Gemma16곡을 보존·재사용하고 새 엔진의 stereo WAV export를16장르 전수 실행한다. 새 AI 작곡으로 표시하지 않는다. 업로드본/원본/악보/MIDI/변환기록/검사결과를 별도 새 Downloads 폴더에 정리한다.

## Final progress
- 2026-10-09 검증: 전체QA·smoke·ChromeUI/신호·16장르파일PASS.
- 2026-10-09 심사: A단계PASS,전체Live범위미완료와후속단계기록.
