# plan-023-composition-quality

## Status
active

## Owner
project_lead / plan_keeper

## User Request
Gemma 전환 후 떨어진 곡 품질을 Codex CLI 수준으로 개선하고 모든 지원 장르를 새로 제작·검증해 Downloads에 SoundCloud 업로드용으로 정리한다.

## Goal
실제 CLI/Gemma 악보·입력·출력 제한을 비교해 원인을 기록한다. 로컬 Gemma 작곡 경로의 선율·화성·리듬·전개를 개선하고 지원16장르의 새120초 곡을 실제 생성한다. 업로드 WAV/원본/악보/MIDI/metadata/품질 근거를 전달한다. 객관적 지표와 청취 판단을 구분하며 CLI 동등 품질을 근거 없이 확정하지 않는다.

## Non-Goals
기존 곡 리믹스를 새 작곡으로 표시, Mock 전달, 유료 API/음악 음색 모델 설치, SoundCloud 실제 업로드, 개인 RAG 동의 변경, 무근거 상업 품질 보장.

## Constraints
관리형 worktree와 codex branch. 기존 데이터·음원·Gemma 서버 보존. 명시적 새 테스트 작곡 요청은 승인 범위이며 provider별 출처를 유지한다. 원격 CLI에는 동의한 공개 brief/독자 작성 guidance만 전달하고 개인 기억은 자동 전송하지 않는다. QA→리뷰→completed/mirror→main/push→branch-d/archive.

## Implementation Plan
- [x] 실제 이전 CLI/Gemma 악보·생성 제약·renderer 비교
- [x] 구간별 확장 작곡과 독립 구조 검증 구현
- [x] 실제 Gemma probe·CLI 비교 기준과 개선 검증
- [x] 새 CLI16기준곡·Gemma16선율변주·전수 신호/악보/MIDI 검사·Downloads 패키지
- [x] QA·리뷰·완료 lifecycle

## QA Plan
전체 npmqa와smoke. 모델응답 대역은경계테스트에만 사용한다. 실제출력의패턴길이/작성음표/화성변화/중복/반복/섹션/요청장르·악기·종결과CPU/출력budget 검사. 실제16장르 신규생성의실패·요청키·model·악보/WAV/SHA를보존한다. 코드/신호 검사가청취품질을보장하지않음을기록한다.

## Review Plan
QA 후 요청 충족·원본·출처·전송/취소·기억 동의·공개 metadata·음악 품질 주장 별도 검토.

## Decision Log
|date|decision|reason|
|---|---|---|
|2026-10-09|현재 지원16장르·120초 신규 작곡을 전수 전달|사용자의 모든 장르 요청을 재현 가능한 앱 preset 범위로 검사|
|2026-10-09|6음표/1–2마디/6패턴 제한을 원인 후보로 우선 audit|CLI는 더 넓은 canonical schema를 쓰며 Gemma 제한은 합성기 문제가 아닌 adapter 정책|

## Progress Log
|date|role|note|
|---|---|---|
|2026-10-09|설계|clean main, 기존active artifact없음, 새관리형worktree생성|

## Completion Notes
사용자피드백에따라최종범위는16CLI독립기준곡과16Gemma스타일보존선율변주다. Gemma가총753pitch를실제draft/polish로변경했다.32곡/64분WAV/악보/MIDI/metadata/provenance를Downloads에전달했으며자동QA·별도리뷰를통과했다. 상세근거는docs/quality/plan-023-verification.md. 전곡청취/음악성동등성/실제업로드는미평가다. 이완료commit을main병합/push하고병합branch삭제와관리형worktree정리로마무리한다.

## Implementation decisions
- 기존 실제 CLI21악보의 작성멜로디중앙값207/패턴16/최대패턴5마디, Gemma16악보24/6/2마디. 합성기는 동일하다. adapter의 표현력 축소를 먼저 해결한다.
- Gemma는 마디별 compact note 객체 응답으로 화성계획1회와6개구간의lead/chords/bass/drums를작성한다. timing/pitch/velocity와동시voicing을전송해6음표 제한을 제거한다. canonical score/WAV/MIDI 계약은version1로 유지한다.
- 단순 copy/repeat 확대를새로운 authored note로세지않는다. 구간경계에pattern을정렬하고outro를요청길이에맞춰작성한다. 각구간의잘못된음표/장르요구는최대1회로컬repair하며전체요청시간과출력/합성예산을유지한다.
- tonal plan은Gemma가선택하며앱은스키마/관계검증·숫자변환/배치만한다. 코드/URL/기존노래/원격fallback은사용하지않는다. CLI기준비교는별도공개brief로실제생성하고양쪽출처를분리한다.
- 실제probe에서flat tuple이마디offset과중복을혼동함을확인했다. 마디별bar0..barN객체·정확한enum pitch/tick으로wire를분리하고앱이bar offset만더한다. 잘못된음표/중복을잘라내거나보완음표를만들지않는다.
- 설치llama.cpp는items:false를거부하므로prefixItems4개+min/maxItems4+런타임4원소검증을사용한다. semanticrepair최대1회상한은유지한다.
- 여러실제probe에서모델이duad/중복옥타브를삼화음으로표시하고같은onset의chord/bass를반복함을확인했다. 유효timing-pair·Gemma선택화성의diatonicvoicing vocabulary·화음/베이스의분리된반마디attack을generation grammar에적용해오류를생성단계에서차단한다. 앱이고정선율/보완음표를새로쓰지는않는다.
- 큰numericenum을prompt에도복제하면4마디단계input이약14Ktoken까지늘어났다. 전체schema는response_format에유지하고모델의설명context에는shape/짧은enum예시만준다. runtime관계검증은유지한다.
- RAG기본자료4건의구식6음표제약을갱신한다. import/명시적생성때같은회원의정확히원본그대로인curated항목만ID/전송동의/개인수정을보존해교정한다.
- 최종Hip-hop은7단계717초/작성멜로디283/24패턴/120초stereoWAV·신호경고0으로실제완료했다. UI기본2variation은20분jobdeadline을초과할수있어llamacpp capability를1로줄이고frontend초안/재사용clamp·추론전거부회귀를추가한다. CLI4variation은유지한다.
- 16장르Gemma신규곡과동일조건CLI16기준곡을별도로제작한다. 새전용CLI테스트계정의공개독자guidance만명시적으로전송동의를설정해동일자료6건을비교한다. 개인계정동의는변경하지않는다.

- 사용자가 리듬·그루브·장르감을 우선한다고 답했다. 첫 Gemma6곡의 bass offbeat 비율은0, Funk drum offbeat 비율0.06인 반면 같은CLI Funk는0.76/0.58이었다. 수치만으로 음악성 판단은 하지 않지만 공통0/24tick 예시의 복제 경향은 제거한다. 첫 pass 악보/음원/응답/시도는 초기 근거로 보존하고 최종16곡을 다시 제작한다.
- Funk/Latin과명시적offbeat곡의본구간은마디마다최소한개의bass엇박,Reggae의chord는짧은eighth-upbeat로schema/관계검증한다. 모델이허용구간안에서tick/gate/pitch/velocity를선택한다. explicitstraight/no-syncopation은profile을해제하며음악성평점으로쓰지않는다. 명시적four-on-floor는grammar첫4kick으로보장하고나머지타악은모델이선택한다. JSON공백을줄이라는안내만추가하고음표budget은줄이지않는다.

- 첫minified시도에서도Hip-hopbass0/24tick과kick/snare만복제됨을실제응답으로확인해미완료후보를별도로보존했다. 최종generationgrammar는본구간의kick/backbeat/hat·ride·shaker역할을분리하고장르별4또는8개subdivision을모델이작성하도록요구한다. Hip-hop은bass엇박과swunghat, Jazz는swungride,Latin은shaker/rim선택을준다. 앱이사후드럼을추가하지않으며모델원본과실패후보를모두보존한다.

- 장르profile은사용자요청의prompt/genre에서만schema설정으로전달한다. 공통genre안내·RAG문구가다른장르의groove로오인되는것을차단한다. 초기첫phase후worker를재시작해최종전수곡이같은코드계약을사용한다. 중단요청키/응답은그대로유지한다.

- 실제서버는prefixItems와items가함께있는drumarray에서items만적용해hat을생성할수없는응답을냈다. 실패후보를보존하고본구간drum을kick0..3/backbeat/hat0..N/fills의namedobject로분리해grammar와독립검증을일치시킨다. fakeHTTP회귀를실제스키마형상으로갱신한다. 공백축소prompt가첫짧은gate예시로편향되지않도록대표enum예시5개와melodic최소3tick을제공한다. 이수정전미완료후보를최종음원으로표시하지않는다.

- 스윙hat을4개quarter-window로분할하면swingeighth가아닌큰long/short간격이됨을리뷰에서발견해8개eighth-window로바로잡았다. Hip-hop/일반backbeat는12/36tick,Trap·Reggaebackbeat는24tick으로구분하고House/Techno/Reggaehat은eighth-upbeat선택을준다. 모델은허용범위의kick·fill·pitch/강약과선율·bass·화음을작성한다. 고정groove제약과모델작성범위를구분하고무근거품질보장은하지않는다.
- 동일bar스키마가4번반복된prompt guide는공통shape1회+마디별화음/bass선택으로축약한다. 실제response_format의전체문법/후속독립검증은유지한다. 일부lead/bass/chord응답을줄이지않고context복제만줄인다. 이수정전스윙간격후보는최종전수곡으로전달하지않는다.

- 이름있는drum첫실제pass는705초후두번째chorus의lead가3pitch로고정되어최대1회repair에도실패했다. 4pitch검사를완화하지않고해당실패의repair문법에서마지막마디4번째lead를후보에없던diatonicanswer로모델이새작성하도록요구한다. 앱이고정음표를추가하지않으며전체canonical/구간검증을다시통과해야한다. 진단에는구간명/repair사유/실제completiontoken을기록해토큰수를음표수로오인하지않는다.

## Style-preserving revision after user listening

사용자가개선Hip-hop도Codex기준과스타일이다르다고답했다. 최종16곡제작을중단하고원본/실패/성공2곡을보존한다. 비교에서Gemma의고음synth·고정3성부·일률적6구간·낮은bass활동과CLI의piano/pad/bell편성·7구간·bass엇박0.7/다양한gain·pan을확인했다.

기존같은project의sourceGenerationId와완성canonical악보를이용하는명시적재사용을llamacpp스타일유지변주경로로연결한다. 다른project/member의참조를허용하지않고새remote호출/자동fallback은없다. source의편성·섹션·pattern·리듬/gate·velocity·mix·bass/drums/pad/동시화음은유지하고Gemma가허용키안의새단선율pitch를작성한다. 반환은새seed/score/WAV/MIDI이며원본을변경하지않는다. 기준구조재사용/새pitch작성량/parent출처를분리해전부Gemma독립작곡이라고표시하지않는다. sourceBPM/길이를유지하고불일치를거부한다.

이번16곡스타일변주는실제CLI16곡의같은owner·같은project이력을별도복제dataDir에서참조한다. 실제생성된parent를보존하며가짜새generation으로복제하지않는다. 한개샘플을실제검증·비교가능하게만든후같은경로로16장르를완료한다. 기본독립Gemma경로도유지한다.

- 사용자청취에서스타일이가까워졌으며새선율을더다듬기로확인했다. 실제반주화성의pitchclass를각선율slot에제공하고마지막cadencepitch를고정한다. Gemma가draft후별도polish를작성하며앱은음표를발명하지않는다. bass/drums/pad/organ과공유한pattern도변경금지한다. 이전16rough변주는보존하고동일parent로16개최종변주를다시제작한다.

- 최종16변주와CLI16기준곡의전수canonical/WAV/MIDI/해시/원본보존검사가완료됐다. raw응답·실패·초기6곡·독립2곡·rough16변주를기본workspace의ignoreddata에보존한다. main과origin/main은같은clean기준이며사용자변경을덮어쓰지않는다.
