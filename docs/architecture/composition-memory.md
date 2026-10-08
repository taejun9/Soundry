# 작곡 LLM과 지식 기억

## 가능성 검토와 현재 범위

2026-10-09 사용자는 Suno처럼 작동하는 흐름, 추후 Gemma 로컬 LLM 전환, 작곡 지식의 축적을 요청했다. 후속 메시지에서 보컬·음색 모델 도입을 제외하고 **작곡까지만** 진행하도록 범위를 확정했다. 프롬프트 → 여러 작곡 결과 → 미리듣기 → 청취 평가 → 다음 작곡에 참고 → 악보 내보내기는 구현할 수 있다. 현재 renderer는 작곡 확인용 연주 합성이다. 현재 악보 계약은 4/4와 intro/verse/chorus/bridge/outro 섹션, 제한된 악기/패턴을 사용한다. 임의 박자·오선보/가창·무제한 길이의 전문 악보 엔진은 아니다.

[Google Gemma 공식 개요](https://ai.google.dev/gemma/docs/core)는 open-weight 모델의 로컬 배포와 텍스트 생성 용도를 설명한다. Soundry는 특정 Gemma 세대를 코드에 고정하지 않고 Ollama 모델 이름을 설정한다. 실제 작곡 능력과 긴 JSON 악보 생성의 안정성은 모델 크기·양자화·하드웨어별로 확인해야 한다. `gemma3:4b`는 설정 예시이며 품질 최적 모델이라는 의미가 아니다.

[RAG 원논문](https://arxiv.org/abs/2005.11401)의 검색 기억과 추론 결합을 작곡 사례에 적용한다. 이 구현은 외부 검색·자동 파인튜닝 없이 SQLite에 지식과 사용자 청취 평가를 축적하고 추론 입력에 관련 자료를 추가한다. 사용하면 자동으로 모델 가중치가 좋아진다고 주장하지 않는다. 작곡 품질의 실제 향상은 아래 비교 gate로 확인한다.

## 모델과 작곡 계약

`CompositionRunner`는 준비 확인과 제한된 JSON 작곡만 담당한다. CodexCliRunner와 OllamaRunner가 같은 `COMPOSITION_SCHEMA`를 사용한다. CliProvider는 공통 악보 검증·variation seed·로컬 renderer를 조합하고 공급자 ID 및 모델 출처를 다르게 기록한다. Ollama는 별도 음악 음원 모델이 아니다.

- 기본 `MUSIC_PROVIDER=cli`: 기존 로그인과 prompt/settings 전송 정책 유지. 지식은 항목별 `allowRemote=true`인 경우만 추가 전송한다.
- `MUSIC_PROVIDER=ollama`: 고정 `127.0.0.1`, 설정된 숫자 포트, 미리 설치된 모델만 사용한다. URL·cloud 모델·redirect·API 키·자동 다운로드·fallback은 허용하지 않는다.
- `SOUNDRY_COMPOSER_MODEL`: 모델 이름 1–80자, `SOUNDRY_OLLAMA_PORT`: 1024–65535. 선택은 backend 설정과 재시작으로 한다.
- `/api/status`에서 cloud.disabled=true를 확인하고 `/api/show`에서 completion capability와 모델 정보, remote_host/remote_model 부재를 확인한다. 오래된 서버의 상태 확인 실패는 미준비로 처리한다. 작곡 요청 직전에도 재확인한다.
- [Ollama 구조화 출력](https://docs.ollama.com/capabilities/structured-outputs)의 format JSON Schema와 stream=false를 사용한다. 16K context, 최대 16K 출력 토큰, 응답 1 MiB·작곡 240초·probe 각각3초를 제한하며 취소 신호를 전달한다. schema 준수만 믿지 않고 앱의 음악 구조 검증을 거친다.
- 로컬 HTTP 연결 취소가 모델 서버의 연산 즉시 종료까지 보장하지는 않는다. 취소 이후 결과는 앱에서 저장·공개하지 않는다.
- 사용자는 Ollama 서버에 `OLLAMA_NO_CLOUD=1`을 적용하고 재시작해야 한다. 앱이 사용자 홈의 설정·인증 파일을 수정하지 않는다. [Ollama FAQ](https://docs.ollama.com/faq)와 [공식 API 상태 구현](https://github.com/ollama/ollama/blob/main/api/client.go)을 따른다.

## RAG 저장과 검색

회원별 최대500개, 항목 제목120자·본문4000자·태그200자·출처300자. 직접 작성/허가 자료/퍼블릭 도메인 중 권한을 선언하며 저장 자체가 권리 검증은 아니다. 회원 정보·파일·웹페이지를 자동 수집하지 않는다. 관리자는 다른 회원 지식을 조회·수정·검색할 수 없다. 가입 전 지식 API는401이다.

현재 검색은 NFKC·소문자·단어와 한국어 연속2글자 기반 **lexical RAG**다. 제목/태그 일치를 본문보다 우선한다. 본문을1000자 passage로 나누고800자 stride를 써 항목별 관련 passage 하나를 뽑는다. 같은 회원의 관련 항목 최대6개를 참고하며 무관한 항목은 넣지 않는다. 최대6000자 본문에 출처·용도 메타데이터가 추가된다. 검색 대상은 작곡 prompt/genre/mood다. 의미 embedding 검색은 아직 구현하지 않았다.

청취 평가4–5점은 긍정 사례,1–2점은 피할 방식,3점은 검색 제외다. 별점은 사용자 주관 평가다. 자동 신호 검사를 음악적 품질 점수로 변환하지 않는다. Mock는 평가 사례로 저장하지 않는다. 원곡을 듣고 좋은 점/피할 점과 이유를 구체적으로 입력한다. 평가한 악보가 있는 경우 BPM·섹션 길이·악기·패턴 수의 구조 요약을 함께 참고하고 전체 선율 악보를 다음 prompt에 복사하지 않는다.

검색은 job 실행 시작 때의 최신 지식을 사용한다. 동일 requestKey를 재전송해도 job/참고 지식을 새로 만들지 않는다. `generation_knowledge`에 실제 선택한 항목 ID·passage SHA256·당시 rating을 남긴다. 지식 수정 뒤 제목/출처 표시는 현재 항목 값이고 digest는 전송 당시 passage 식별자다. 원문 snapshot은 중복 저장하지 않는다. 지식 삭제 시 FK를NULL로 바꾸고 출처 제목을 삭제됨으로 표시한다. 과거 전송을 되돌릴 수는 없으며 다음 검색에서 즉시 제외된다.

모델에 전달하는 지식은 JSON 데이터와 untrusted-reference 안내로 구분한다. CLI의 도구 차단·Ollama의 도구 미전달·독립 악보 검증을 함께 유지한다. 악보/음원 성공과 무관하게 참고 시도 기록은 생성 이력에 남을 수 있다.

## 작곡 결과물

새 작곡부터 검증된 variation 악보를 `generation_scores`에 로컬 보존한다. 기존 곡에 없던 악보를 추정해 만들지 않는다. 음원 소유권을 확인하는 기존 guard 아래에서 악보 JSON과 MIDI를 내려받는다. 실패한 부분 작곡에는 공개 Track가 없어 내보낼 수 없다. 프로젝트 삭제는 관련 악보·참고 기록도 cascade한다. 지식/청취 기록은 별도로 삭제하기 전까지 유지하며 삭제된 Track는NULL 참조가 된다.

MIDI는 type1/480PPQ, 템포·4/4·섹션 marker·악기별 track·GM program·drum channel10·음표 velocity/gain·transpose와 정확한 종료점을 제공한다. 같은 악기의 겹친 같은음은 한 발음의 gate로 합친다. MIDI는 기존 WAV와 같은 음색·pan·release를 보장하지 않으며 DAW에서 원하는 악기와 믹스를 지정한다. 전체 원래 합성 정보는 JSON에 보존한다.

## 작곡 품질 gate

이번 구현은 지속적으로 지식·평가를 축적하는 기능의 완료다. **판매 가능한 작곡 능력 달성 또는 RAG의 음악 품질 향상은 미검증**이다. 실제 Gemma가 없는 환경에서 fake Ollama와 자작 악보 회귀를 실제 Gemma 추론 성공으로 기록하지 않는다.

후속 품질 평가는 같은 장르/요청/BPM/길이의 고정 brief 목록을 만들고 CLI/Gemma 및 RAG 사용 전후를 비교한다. 최소20개 brief에서 형식 유효율, 요청 준수, 멜로디 기억성, 화성 연결, 리듬 변화, 곡 전개·종지, 반복 과다, 수정 필요 시간을 기록한다. 청취 순서를 섞어 평가하고 생성 모델·참고digest·사용자 평가를 함께 남긴다. LLM 출력은 seed만으로 동일하게 재현되지 않으므로 같은 LLM 출력이라는 가정은 두지 않는다. 작품별 사람이 최종 편곡과 사용 자료의 권한을 확인한 뒤 상업용 여부를 판단한다.

충분한 사람이 승인한 사례와 실패 사례를 모은 뒤 embedding 검색 및 별도 LoRA/파인튜닝 여부를 새 실행 계획에서 검토할 수 있다. 보컬·음색 음악 모델, 결제·클라우드·추적은 현재 범위에 포함하지 않는다.

## llama.cpp 직접 연결 — plan-020

사용자가 `http://127.0.0.1:8089`에 이미 구동한 Gemma는 `MUSIC_PROVIDER=llamacpp`, `SOUNDRY_LLAMA_PORT=8089`로 선택한다. Ollama 설치/설정은 필요하지 않다. `/health`가ok이고 `/v1/models`에 하나의 준비된 로컬 모델이 있으면 그ID를 사용한다. 모델 경로가ID에 있어도 공개 출처에는 제한된 basename만 기록한다. 서버를 구동/다운로드/모델load/unload하는 API는 호출하지 않는다.

[llama.cpp 공식 server 문서](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)에 따라 `/v1/chat/completions`의 schema-constrained response_format, stream=false, thinking none을 사용한다. 모델이 반환한 content 전체를JSON으로 읽고 기존 음악 구조 검증을 유지한다. tools는 전달하지 않으며 finish_reason이stop인 하나의assistant 응답만 받는다. endpoint는127.0.0.1과숫자포트로 제한하고redirect/키/원격fallback을 허용하지 않는다. 응답1MiB·실행240초·취소 경계는Ollama와같다. localhost의API호환형식이며OpenAI서비스에접속하지않는다.

llama.cpp는CLI와달리전송동의가없는로컬지식도같은회원범위에서참고한다. 서버출처·악보·참고digest와MIDI는기존저장경로를사용한다. 실제검증근거는plan-020의QA기록을따른다.

Gemma 실제 응답의 끝섹션 누락·드럼 역할 혼동을 확인해 llama.cpp에는 더 구체적인 출력 schema를 사용한다. BPM 생략 시120이고 앱이 요청 길이/템포로 intro/verse/chorus/bridge/outro5구간의 길이를 계산한다. 선율·화성·리듬 음표와 편성은 모델이 새로 작곡한다. m1–m8은 멜로디, d1/d2는 드럼 역할이고 드럼은 허용 pitch로 제약한다. 후보6패턴·멜로디 패턴별정확히6음표를 요구해 기존4개 멜로디 패턴/24개음표 기준을 충족하도록 돕는다. 최종 결과는 기존 검증기가 다시 판단한다. 이 형식 제약은 음악적 품질 보장이 아니다.

llama.cpp 작곡은1단계에서후보패턴을만들고2단계에서실제로생긴패턴ID만참조해각섹션을편곡한다. 앱이섹션시점과패턴길이로repeats를계산하고사용한패턴만최종악보에남긴다. 음표·편성·음량·pan·transpose는모델출력이며최종구조/다양성/무음/동시발음검증을유지한다. 한variation에로컬추론2회가필요하며자동실패재시도/원격fallback은없다.

llama.cpp의한번에만들곡수는최대2개다. 후보패턴은1–2마디로제한하고각추론출력은최대4096토큰이다. 후보패턴/편곡추론은각240초이고기존job전체20분상한도적용한다. Ollama/CLI의최대4개와구분해UI/API에서같이제한한다.
