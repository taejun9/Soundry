# plan-023 작곡 품질 복원 검증

## 결과

지원16장르의새Codex기준곡16곡과그스타일을유지한Gemma선율변주16곡을제작하고Downloads에정리했다.32곡/64분의실제WAV·JSON·MIDI·metadata·provenance를전수검증했다. Gemma변주는새편곡16곡을독립작성한것으로표시하지않는다.

## 코드 QA

- NumPy지원Python을지정한`npm run qa`:56files/549tests PASS, lint/strict타입검사/productionbuild/base/audio와음악Node18/Python24검사PASS.
- `UI_PORT=5174 npm run qa:smoke`:API/Viteproxy/UIentry/포트충돌/정상종료와두포트해제PASS. 사용자DB대신임시Mockdata를사용했다.
- 별도quality-benchmark/finalize_quality/style-probe/quality-probe strict TypeScript PASS, 패키징/전수검증Python구문과최종eslint/diff검사PASS.
- 참조API통합:같은project소유권/다른owner참조400, sourceaudio삭제후악보보존, BPM불일치400/추론0회, reference-v3 schema전달과반환model의generation/track기록PASS.
- 선율경계:마지막cadencepitch, 보호악기공유pattern, 동시화음,전체timing/gate/velocity/parts/sections/mix와원본불변PASS. 대역은계약·취소·출력경계테스트에만사용하며Downloads에포함하지않는다.

## 실제 생성

- CLI16곡은17시도:Techno첫CLI_INVALID_OUTPUT보존후두번째실제성공. 같은publicbrief/BPM/120초/seed/6공개guidance와renderer를사용했다.
- 초기독립Gemma6곡·prompt-only시도·schema호환실패·중단후보와개선독립Hip-hop/Trap2곡을보존했다. 개선독립곡도스타일이다르다는피드백에따라최종독립16곡제작을중단하고참조변주로전환했다.
- 사용자에게실제reference-v3 Hip-hop을제공했고스타일이가까워졌으며새선율을더다듬기라는답을받았다. 이후실제반주pitchclass를slot별제공하고Gemma가draft후별도polish를작성한다. 프레이즈마지막pitch를유지한다.
- 두번째Hip-hopprobe는2응답각138completiontoken, draft대비10pitch/원본대비24pitch변경.120초stereo44100PCM16/peak-0.9155dBFS/신호경고0. 최종Hip-hop은별도실제batch결과다.
- 최종Gemma16변주:16시도성공,원본대비총753pitch음표변경. 기준편성·리듬·반주·전개·mix를상속했다. 전체악보음표집계에는상속음표가포함되며새작성량과구분한다. 기존rough16변주도별도보존했다.

## 최종 전달 전수 QA

`finalize_quality.ts`:32canonicalscore/원본SHA/16장르대응/6guidancedigest/요청드럼·Housequarterkick PASS. Gemma16곡은parent악보와직접대조해선율slot밖pitch/전체리듬·gate·강약·편성·구간·gain/pan·cadenceanchor불변, pattern별최소1/3pitch변경,변경집계와parentSHA·CLI음원출처일치를전수PASS했다. 참조변주에는독립sectional-v2형상제약을잘못적용하지않는다.

`verify_quality.py`:실제원본32/Provenance32/Upload32의WAVdecode와독립표준wave reader PASS.전부120초·stereo·44100Hz,원본PCM16/업로드PCM24,업로드samplepeak≤-1dBFS,신호경고0,32원본/32업로드SHA모두고유,원본보존·독립inode PASS.32JSON/32MIDI복사SHA와binaryMIDI note-on/off·EOT독립파싱PASS. 같은입력·공개guidance를대조했다.

Downloads의`Gemma_Style_Matched`/`Codex_Reference`에각16업로드WAV와metadataTXT/uploadCSV,originalPCM16·변환기록·JSON/MIDI가있다. `Comparison`에전수verification/summaryJSON·리듬비교·새pitch작성수·빈청취CSV,root에한글안내와최종진행상태를작성했다.24bit변환은원본정보증가로표시하지않는다.

## 데이터·전송·미검증 경계

원격CLI에는새전용테스트회원의독자작성공개자료만명시적으로동의해전달했다. 개인회원·RAG전송동의·기존음원·.env를변경하지않았다. Gemma는기존loopback서버이며설치/모델다운로드/원격fallback이없다. 실제parentgeneration·owner/projectDB를별도dataDir에서복제참조하며가짜job을만들지않는다. Raw응답/DB/음원은ignoreddata에보존하고Git에넣지않는다.

파일형식·구조검사가음악성승인을뜻하지않는다. 사용자청취피드백은Hip-hop샘플범위이며전체32곡의사람청취·CLI동등음악성·상업품질은미평가다. LUFS/truepeak/외부DAWimport/실제SoundCloudupload를수행하지않았다.
