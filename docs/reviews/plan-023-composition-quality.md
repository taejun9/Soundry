# plan-023 composition quality 리뷰

## 판정

PASS. 코드 QA와실제32파일전수QA를확인한후범위·정책·사용자흐름을별도판단했다. 동일agent의별도리뷰단계이며독립agent리뷰라고표시하지않는다. [전수검증근거](../quality/plan-023-verification.md)를따른다.

## 검토

- 사용자요청과피드백:지원16장르를완료했다. 독립Gemma의음표제약은제거했지만스타일차이가남아청취피드백에따라자신의CLI악보를참조한다. 최종곡은새선율변주이며전체편곡/전체음표를Gemma새창작으로표시하지않는다. 원본·초기·실패·중단·rough후보는보존한다.
- 실제모델과표현:loopbackGemma의실제draft/polish응답을사용하며앱이보완음표를발명하거나Mockfixture를전달하지않는다. 선택pitchvocabulary/최소변경량은형식·참조스타일정책이며음악성평점이아니다. cadence·보호악기공유pattern과동시화음을보존한다.
- API/DB/UI:기존sourceGenerationId와canonicalversion1/JSON/MIDI/renderer를사용한다. 완료source의variation0score를같은project에서만참조한다. 불일치설정은quota/추론전에거부한다. UI에서참조해제/출처설명이있고실제model을generation/track에기록한다. sourceaudio삭제후score참조는기존악보보존정책과일치한다.
- 취소·예산:최대1variation/16분compose/각240초chat/20분job와신호·출력·canonical예산을유지한다. 무제한repair/잘못된음표의사후보완/자동remotefallback이없다.
- 기억·전송:exactoriginalcurated4건만회원소유ID/allowRemote/수정을보존하며교정한다. 개인기억은외부로자동전송하지않고참조score는로컬provider에만전달한다. 실제공개CLI기준자료의명시적동의와개인계정동의를분리했다.
- 패키지:실제32WAV·원본·악보·MIDI·metadata·provenance를전수검증했다. 상속편곡/새pitch작성수/parent출처를공개기록에구분한다.24bit변환을정보증가로주장하지않는다. 음원/DB/응답/.env는Git에서제외했다.

## 잔여 한계

최종16변주는독립Gemma작곡의CLI동등성을입증하지않는다. 사용자샘플청취와전수신호/구조검사를구분한다. 전체곡사람청취·음악성동등성·상업품질·LUFS·truepeak·외부DAWimport·SoundCloud실제업로드는미평가다. 기존음색합성기의현실성은이번변경범위에포함되지않는다.
