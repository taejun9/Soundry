# Live 제작 흐름 조사와 Soundry 통합 지도

조사일: 2026-10-09. 사용자 요청으로 공식 Live 12 매뉴얼의 기능군과 UI 구성을 조사한 뒤 작업을 시작했다. **전체 기능의 동일 구현은 미완료다.** plan-022는 첫 오디오 제작 통합이며 아래 잔여 단계는 실제 구현 gate를 거쳐야 한다. Ableton 소스·바이너리·Packs·이미지를 가져오지 않고 Soundry 엔진으로 기능을 직접 구현한다.

## 자료와 적용

- [공식 매뉴얼 목차](https://www.ableton.com/en/live-manual/12/welcome-to-live/): 전체 기능군의 조사 기준. 매뉴얼 원문을 저장소에 복제하지 않았다.
- [에디션 비교](https://www.ableton.com/en/live/compare-editions/): Intro/Standard/Suite 구분, Live 12.3/12.4 표기까지 확인. Suite 기능군을 조사 기준으로 삼으며 에디션별 번들 숫자를 Soundry 기능 수로 환산하지 않는다.
- [Arrangement](https://www.ableton.com/en/live-manual/12/arrangement-view/): 선형 편집과 클립 조작. Soundry는 초 단위 clip 저장을 유지하면서 마디 격자와 clip inspector를 추가한다.
- [Session](https://www.ableton.com/en/live-manual/12/session-view/): 행렬과 장면 실행. Soundry 첫 런처는 기존 행별 클립 순번을 슬롯으로 사용한다. 독립 슬롯 저장·quantized launch·Follow Actions·Session 기록은 후속 단계다.
- [Mixing](https://www.ableton.com/en/live-manual/12/mixing/): 트랙별 음량·pan·mute/solo와 routing 조사. 첫 통합은 로컬 행 믹서와 master에 한정한다.
- [MIDI 편집](https://www.ableton.com/en/live-manual/12/editing-midi/), [자동화](https://www.ableton.com/en/live-manual/12/automation-and-editing-envelopes/), [녹음](https://www.ableton.com/en/live-manual/12/recording-new-clips/): 각각 악보 편집 모델, 곡선 저장, 입력 장치/실시간 엔진이 필요하다.
- [기기 처리](https://www.ableton.com/en/live-manual/12/working-with-instruments-and-effects/), [악기](https://www.ableton.com/en/live-manual/12/live-instrument-reference/), [오디오 효과](https://www.ableton.com/en/live-manual/12/live-audio-effect-reference/): 자체 DSP 설계의 조사 기준. Soundry의 Low-pass/Delay는 Ableton 기기 재현이라고 표시하지 않는다.

## 기능군별 현황과 단계

다음 표는 공식 매뉴얼 전반을 Soundry의 구현 책임으로 묶은 것이다. 기기별 모든 파라미터·오디오 동등성 감사는 완료되지 않았다. '일부'는 UI가 비슷하거나 기능 이름이 있다는 이유로 동등하다고 판정하지 않는다.

| 기능군 | Soundry 현재/plan-022 | 남은 실제 작업 | 단계 |
|---|---|---|---|
| 프로젝트·파일·Set 관리 | 로컬 프로젝트/이력/원본 보존 | project bundle, collect/missing file repair, templates, 다중 Set | C |
| Browser·검색·분류 | 프로젝트 원본 제목/장르 검색 | 사용자 샘플 import, tag/collection, preview, similarity | B/C |
| Control Bar·transport | play/stop/seek, BPM 편집 격자, 4/4 마디 표시 | metronome/tap/loop/tempo map/박자 변경/locator | B |
| Arrangement 편집 | 행/클립 이동·resize·복제·분할·50단계 undo/redo·snap | 다중 선택·linked/ripple/consolidate/crossfade/group | B/C |
| Session·장면·launch | 행별 순번 장면/단일 클립 즉시 실행 | 독립 슬롯·launch quantization/legato/Follow Actions/기록 | B |
| Clip 상세·파형 | start/offset/length/loop/gain/fade, 실제 왼쪽 원본 파형 | reverse/transpose/crop/replacement/envelope | B |
| Tempo·Warp | 격자 BPM, 원본 속도 유지 | 분석·warp marker·시간 신축·pitch 독립 처리 | C |
| MIDI sequencing·피아노롤 | AI 악보 조회·JSON/MIDI export | note CRUD/velocity/chance/scale/fold/multi clip editing | B |
| MIDI 생성·변환 tools | AI 작곡 preset/RAG | 독자 arpeggio/quantize/rhythm/Euclidean/chord tools | B/C |
| MPE·microtuning | 없음 | per-note expression·조율·멀티채널 | D |
| Audio→MIDI·slicing | 없음 | melody/harmony/drum 추정·slice source 모델 | C |
| Groove·humanize | 작곡 prompt에서 요청 가능 | groove pool/extract/commit, 비파괴 timing offset | C |
| 녹음·capture·comping | 없음 | audio/MIDI 입력·arm/monitor·take lanes/punch/overdub | C |
| Routing·I/O·groups | 독립 행→master | bus/group/send/return/sidechain/외부 장치 | C/D |
| Mixer·master | gain/pan/mute/solo·master·기존 compressor, export peak 감쇠 | 실제 meter·crossfader·latency 보정/다채널 | B/C |
| Automation·clip envelope | clip fade만 | breakpoint curves·interpolation·record/read/write·modulation | B/C |
| Instruments·sampler·drum rack | 기존 10종 로컬 청취용 synth | 자체 synth/sampler/drum pad, preset/rack/macros | C |
| Audio effects·racks | 자체 low-pass와 단일 feed-forward delay | EQ/dynamics/reverb/distortion/pitch/spectral/rack/chains | C |
| MIDI effects·racks | 없음 | MIDI 처리 graph·chain/preset/macro | C |
| Freeze·flatten·resample | offline mix export | per-track freeze cache/invalidation/flatten | C |
| VST2/VST3·AU·device A/B | 없음 | native host·sandbox·state·latency·preset 비교 | D |
| Max for Live·extensions | 없음 | 호환 runtime 또는 별도 자체 extension 계약 조사 | D |
| MIDI/key mapping·external sync | 편집 keyboard shortcut | Web MIDI/native MIDI, CC mapping/clock, Link/CV | D |
| Push/Move·하드웨어 | 없음 | 공개 SDK/protocol 확인·실기 QA | D |
| 영상·다채널 export | stereo PCM16 WAV/JSON/MIDI | 영상 timeline, 다채널/stems/format/dither 선택 | C/D |
| Accessibility·학습·설정 | keyboard focus/label·반응형 스튜디오 | 상세 도움말·shortcut 변경·추가 테마/장치 설정 | B |
| Stem separation·Splice·Note/Cloud | 없음 | 로컬 stem 모델 검토, 외부 계정/전송은 별도 승인 범위 | D |

## UI 통합 방향

Soundry의 프로젝트 작업 공간에 Browser(좌측) → Arrangement/Session(중앙) → Mixer/Clip(하단) 순서를 적용했다. 작은 화면에서는 원본 목록을 가로 스크롤로 전환한다. 생성·RAG·이력은 기존 기능으로 유지하며 새로운 제작 공간 아래에서 접근한다. Soundry 색상·글꼴·컴포넌트를 사용하며 Live 스크린샷/아이콘을 제품에 넣지 않는다.

BPM 변경은 snap/ruler만 바꾼다. 오디오 time-stretch 기능으로 오인하지 않도록 화면에 표시한다. Session 실행은 이전 preview를 정지시키며 장면이 저장된 arrangement의 시작 위치를 수정하지 않는다. 행별 mute/solo·gain/pan·low-pass·delay와 clip fade는 live/offline 공통 graph를 사용한다. export는 PCM16/stereo/44.1kHz이며 -1dBFS sample peak를 넘는 경우에만 감쇠한다. 진정한 brickwall/true-peak limiter나 loudness mastering은 구현하지 않았다.

## 후속 phase gate

- A(plan-022): 조사·통합 지도, 실제 오디오 편집/믹서/런처와16장르 export 검증.
- B: MIDI 피아노롤/기초 변환, 독립 Session 저장/quantized scheduling, automation, transport 보강. 각 기능별 새로운 active plan과 QA/리뷰가 필요하다.
- C: audio import/녹음/warp/분석, 자체 악기·효과·bus·freeze와 project bundle. 음원 품질과 realtime latency budget을 먼저 정의한다.
- D: native plug-in/하드웨어/extension/다채널, 지원 플랫폼별 실제 호환 검사. 브라우저만으로 native plug-in을 로드할 수 없으므로 desktop/native engine 설계가 선행되어야 한다.

후속 단계가 존재한다는 사실은 실행 완료·제품 동등성을 의미하지 않는다. 현재 Vue/Web Audio/제한된 악보 합성만으로 Live 전체를 흡수 완료할 수 없다. 이 구조 차이와 미구현 표를 제품 로드맵에 연결한다.
