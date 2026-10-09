# plan-021 검증 기록

## 범위와 실제 자료 경계

사용자가 요청한 앱 지원16장르 실제 작곡/업로드 준비, RAG 점검·확충과 같은 LAN Windows 접속이다. 실제 창작물/DB/환경값은 ignored data와 Downloads에만 둔다. 보컬/음색 모델·Suno 생성/업로드·SoundCloud 업로드를 수행하지 않는다. Gemma 서버 설정과 프로세스를 변경하지 않는다.

## RAG audit

기존 실행 data root의 단일 계정: knowledge0건. plan020 검증 data root는5건이지만 서로 다른 본문/태그는각1개다. 충분한 축적이라고 볼 수 없다. 장르별 형식·화성·리듬·선율·편곡·평가6개씩96개의 서로 다른 독자 작성 자료를 준비했다. 기존data DB를백업한후 같은 단일회원범위에96건을저장했다. rights own, allowRemote false, rating null. 내용은 기존음악/악보를복사하지 않은 프로젝트guidance며96개의전문가승인사례가아니다.

실제 genre preset16개 모두관련서로다른자료6건을검색하며전송미동의자료는CLI검색에서제외된다. 중복passage억제·선택장르의정확한태그우선순위·기존회원소유권API회귀를검증했다. 가중치학습/embedding검색/품질개선의인과관계는미검증이다.

## 코드 QA

- `SOUNDRY_PYTHON=<bundled NumPy Python> npm run qa`: lint/typecheck,최종53files/528tests, build, base, mock audio2건, 음악Node18/Python24검사 PASS. 이 명령은 실제음악을생성하지않는다.
- 신규harness에 별도strict NodeNext/experimentalDecorators tsc 검사 PASS.
- 후속문구/경로오류처리변경: lint/typecheck/build,관련5files/49tests PASS; 타악기누락관찰관련1test PASS.
- `npm run qa:smoke`: 임시Mock data/API/Viteproxy/UI/포트충돌/Ctrl-C후포트해제 PASS. 기존API/LAN을잠시중지했다복원했으며Gemma8089는유지했다.
- stage후 diff/base검사와최종산출물검사는완료기록에서갱신한다.

## LAN 실제 실행

명시한RFC1918 IPv4의UI포트만정적빌드gateway로열었다. localhostUI의같은포트와함께bind할수있고API3000·Gemma8089는127.0.0.1만LISTEN한다. LAN /account200, /members/session setupRequired false,동일Origin의잘못된login요청400(인증입력검증까지도달),다른Origin/Host403을확인했다. 실제IAB로그인화면과'서버에저장'안내확인. 방화벽상태는이미disabled로확인됐고변경하지않았다. Windows기기에서직접로그인/생성/재생은미수행이다. 사용자에게접속주소를전달했으며계정비밀번호를바꾸거나공개하지않았다.

## 실제 Gemma 16장르 검사

전용plan021-genre-benchmark data root에서기록된요청키/최종장르별최대3개새생성/실패코드/출처/악보/MIDI/WAV/참고digest를보존한다. 모든장르는120초·4/4이며BPM은장르별명시값이다. 일반provider의자동재시도/원격fallback과구분한다. 참고자료는현재corpus만사용한다. 음색은기존로컬합성기다.

최종16개장르/120초씩완료. 최종배치총19회요청: Reggae1차·House리듬재검사2차는LOCAL_INVALID_OUTPUT,기존House1차는구조유효하지만명시적리듬미충족으로교체했다. 최종House3차·Reggae2차와다른14장르1차를전달한다. Suno비교음원/사람의청취없음. 스타일요구누락과과도한반복도표시하며판매가능성이나Suno우위를확정하지않는다.

## 실제 초기 probe에서 확인한 개선

초기5개장르의완료본을별도initial-probe/initial-artifacts로보존했다. 초기Hip-hop1차는LOCAL_INVALID_OUTPUT,2차는성공. Trap/R&B/Pop은타악기요청에도드럼0개였고Rock은1개드럼패턴을포함했다. 후보6개가모두멜로디로채워지는문제를확인해타악기요청에는4개멜로디+2개드럼후보를보장하고, m3의저음역/베이스역할·옥타브전조·chorus드럼존재를검증했다. 명시적무드럼요청은드럼후보를제외한다. 이변경은작곡구조의정확성개선이며음악적우수성판정은아니다. 입력수정전중단된setup시도와REQUEST_KEY_CONFLICT도별도기록/기존DB이력에보존했으며같은키의다른입력을우회하지않았다. 최종배치에는새키/고정입력을사용한다.

기본자료import API의로그인·회원격리·동일본문중복·405+96상한원자성회귀PASS. localhost5175/임시Mock API31300과합성QA계정을써기존127.0.0.1사용자쿠키와실행서버를유지하면서실제화면0→96건추가/재추가후96건을확인했다. 프로젝트/계정/지식은임시data다. UI스크린샷은ignored data에보존한다.

House초기최종배치완료본은4박킥요청에quarter킥coverage13.7%로구체리듬요구를놓쳤다. 명시적four-on-the-floor일때만d1의1마디4박kick/중복박거부/verse·chorus사용을검증하고부정요청은제외했다. 2files/11관련tests와53files/528전수tests·musicQA PASS. House는초기파일을보존하고추가검사한다.

## 최종 실제 결과와 패키지

|장르|BPM|시도|작성 멜로디 음표|멜로디 패턴|드럼 onset|최장 동일 패턴 반복(초)|
|---|---:|---:|---:|---:|---:|---:|
|Hip-hop|88|1|24|4|93|38.2|
|Trap|140|1|24|4|116|37.7|
|R&B / Soul|92|1|24|4|69|36.5|
|Pop|118|1|24|4|54|36.6|
|Rock|132|1|24|4|132|36.4|
|Funk|108|1|24|4|92|35.6|
|Jazz|116|1|24|4|222|37.2|
|House|124|3|24|4|198|34.8|
|Techno|132|1|24|4|132|36.4|
|Drum & Bass|172|1|24|4|222|36.3|
|Ambient|60|1|36|6|0|40.0|
|Cinematic|88|1|24|4|67|38.2|
|Acoustic / Folk|96|1|24|4|42|35.0|
|Classical|84|1|36|6|0|34.3|
|Latin|104|1|24|4|107|36.9|
|Reggae / Dub|76|2|24|4|50|37.9|

최종source score16개를canonical parser로다시검증했고원본SHA를전수확인했다. 타악기요청14건의chorus드럼/베이스역할, Ambient·Classical무드럼과House d1의4개quarter킥/verse·chorus사용을확인했다. House전체timeline quarter킥coverage는13.7%→62.9%다. 신호검사RMS/peak를음악품질점수로표시하지않는다. 다른장르의장르적표현/선율전개/화성표현력/종결/음색은사람의청취미수행으로미검증이다. Techno는전체quarter킥coverage낮음관찰이남아있으며명시적four-floor요청이아니므로자동으로규격화하지않았다.

Downloads의새 Soundry_16Genres_2026-10-09폴더에104파일: Upload_WAV16곡,Provenance원본16곡+설정/변환16JSON,Metadata제목/설명/태그·CSV/JSON,Scores16JSON+16MIDI,Quality분석/표/보고서/빈청취·Suno비교기록지/독립파일검증,안내TXT. 무변환원본PCM16을보존하고업로드본PCM24에-1dBFS peak목표의소폭감쇠/10msfade-in/1초fade-out/dither를적용했다. 24bit변환이원래16bit정보를늘리지않음을보고서에명시했다.

실제16uploadWAV+16원본의SHA/길이/포맷/클리핑·장시간무음/출처를독립검사했다. upload모두120초/stereo/44100Hz/PCM24/peak약-1dBFS,경고0·hash16개서로다름. MIDI별SMF type1/480PPQ·모든chunk/VLQ/event·note-on/off대응·정확한end tick를독립파서로검사했다. 각악보장르와실제RAG6개/서로다른digest/장르일치를확인했다. 최초검사기의EOT직전delta0가정은올바르지않아표준가변delta로고쳤으며산출물을바꿔통과시키지않았다. 패키징preflight에서Heuristic키의uri부분이민감키검사에걸려공개키를scaleFitEstimate로고쳤다. 민감키차단은유지했다.

최종구조관찰16건을기존계정에추가: before96/added16/after112/distinct112/allowRemote추가0/humanrating추가0. 각관찰은청취미평가·작성음표/반복/음역/요구타악기누락같은사실을명시하며전문가승인사례로표시하지않는다. 기존DB를추가전다시백업했다. 모델가중치학습/RAG효과인과검증/판매품질/Suno우위/DAW실제import/Windows기기직접조작/SoundCloud업로드는미수행이다.
