# plan-020 llama.cpp/Gemma 검증

확인일2026-10-09 Asia/Seoul. 사용자가8089에구동한Gemma를직접연결했다. 모델/서버프로세스를종료·변경하거나모델을다운로드하지않았다. 실제데이터는Git에포함하지않는다.

## 자동검증

fresh npm ci --offline 후 전체 `npm run qa`에서50files/481tests, lint0warnings, strict frontend/backend타입·build·base·Mock WAV2개·음악Node18/Python23 PASS. 마지막출력복잡도제한과출처고정변경은lint/typecheck/build및관련3files/17tests로다시확인했고최종모델재조회출처회귀5tests도PASS했다.

fake loopback HTTP로health/단일모델/미준비·remote모델거부, schema/도구미전달/thinking none, 출력중단·잘못된JSON/크기/redirect/취소/timeout을검증했다. 2단계motif/편곡은실제로생성된ID만참조하고섹션길이로시점/repeats를계산하며원래악보검증기를통과했다. 요청메타데이터·전체마디/종지·드럼역할·멜로디음표하한과원래schema불변을확인했다. CLI/Ollama/RAG/회원/저장회귀도유지했다.

`UI_PORT=5175 npm run qa:smoke`에서임시Mock데이터의API/proxy/UI·충돌·Ctrl-C후포트해제PASS. 기존Soundry backend만정상종료했고사용자8089서버는유지했다.

## 실제 Gemma

health200, 단일Gemma4 E4B Q4계열모델, slot별context32768/4slots를확인했다. 별도 `data/plan020-gemma-validation`에가상회원·자체작성음악brief/지식을두고실제로컬Gemma를호출했다.

| 시도 | 결과 | 근거와조치 |
|---|---|---|
| 1 | LOCAL_INVALID_OUTPUT,98초 | 제한된JSON반환이최종악보계약에실패 |
| 2 | LOCAL_INVALID_OUTPUT,92초 | 로컬진단에서outro누락·드럼역할·멜로디음표부족확인 |
| 3 | LOCAL_INVALID_OUTPUT,118초 | 형식제약을강화했으나없는d1참조확인 |
| 4 | LOCAL_TIMEOUT,241초 | 2단계의후보출력이240초상한에닿아6패턴/1–2마디/멜로디6음표/4096토큰으로제약 |
| 5 | completed,142초 | 실제새motif→편곡→최종음악검증→90초WAV/악보/참고출처저장 |

시도는실제QA의명시적새요청이며운영adapter가실패를자동재시도하거나원격으로fallback한것이아니다. 이전실패를성공으로바꾸지않았다. 원시진단은로컬QAdata에만두고Git/log/API에공개하지않는다.

완료generation bca4028b-f9c1-448d-97dc-cfe9ac596f2f, track c468eb5d-22a7-4293-8456-e7aba31541e3. provider llamacpp, 모델출처 gemma-4-E4B-it-GGUF:gemma-4-E4B-it-UD-Q4_K_XL. 120BPM/Jazz/warm, 실제90.0초/stereo/44100Hz/PCM16/15876044bytes를독립wave reader로확인했다. SHA256 `5249259734003f6d77b4108462cf48eb46808dffcccb159107a1e0706feea063`.

RAG는allowRemote=false인같은회원의검증지식5개를참고했다. 반복QA준비로같은본문이5row로저장된것이며서로다른5종학습자료/음악품질개선실험을뜻하지않는다. 실제LLM응답은고정fixture나이전악보를복제한것이아니다. 앱이5개섹션형식/반복시점을계산하고모델이음표·화성·리듬·편성을작성한다.

HTTP소유권API로실제악보JSON/MIDI를저장했다. MIDI MThd/type1/10tracks/480PPQ, 악보6패턴을확인했다. 파일은같은QAdata root의composition.json/composition.mid에있고원본WAV는audio/<trackId>.wav다. 실제DAW import는미수행이다.

## 실제화면

가상QA회원로그인후실제완료곡·llama.cpp/모델출처·최대2곡·로컬전송안내를확인했다. WAV재생→진행약60초→일시정지, JSON/MIDI버튼과악보구조·참고5개를확인했다. 390px에서scrollWidth=viewport390으로넘침0이며긴모델출처가줄바꿈된다. viewport를원복했다. 화면에서작곡추론을추가로시작하거나청취품질별점을대신입력하지않았다.

## 한계와정리

실제Gemma1곡E2E성공이지속성공률·RAG개선·작곡/상업품질보장은아니다. 음악적청취평가·다장르평가·true peak/LUFS·판매검증은미수행이다. 기본템포120/5섹션/작은후보패턴·2단계제약이있다. 현재Gemma에서는한곡약142초였고실행환경/요청에따라달라진다.

QA프로세스를종료하고기존primary data root/UI5174를유지해MUSIC_PROVIDER=llamacpp와포트8089로복원한다. `.env`의해당설정만변경하고기타값은보존한다. QA뒤별도리뷰·계획완료·main병합/push·브랜치삭제·관리형archive를수행한다. 최종실행/Git상태는완료보고로확인한다.
