# 실제 생성 공급자와 테스트 음원 조사

조사: 2026-09-30, 기록: 2026-10-01. Fal MCP의 모델 추천·스키마·가격 읽기 전용 조회는 인증된 연결에서 성공했다. 잔액, 실제 생성, 청취 품질은 아직 검증하지 않았다. 연결된 MCP 인증과 Soundry backend의 API 키는 별개이며 현재 실행 환경에는 FAL_KEY가 설정되지 않았다.

## 후속 Phase 8 후보

`fal-ai/stable-audio-3/medium/text-to-audio`를 instrumental 첫 후보로 선택한다. live schema는 duration 1–380초, WAV/FLAC, seed를 지원한다. BPM/genre/mood는 프롬프트 지시로만 전달하며 실제 측정 metadata로 복사하지 않는다. vocal capability는 첫 adapter에서 지원하지 않는다.

- [공식 endpoint](https://fal.ai/models/fal-ai/stable-audio-3/medium/text-to-audio)
- [공식 schema](https://fal.ai/models/fal-ai/stable-audio-3/medium/text-to-audio/api)
- [Stable Audio 3 공식 발표](https://stability.ai/news-updates/meet-stable-audio-3-the-model-family-built-for-artistic-experimentation-with-open-weight-models)

조회 가격은 $0.0376/audio이며 20곡 1회씩의 추정값은 $0.752다. 실제 실행 직전 가격·스키마와 성공 결과를 확인한다. 품질을 듣기 전 가장 우수한 모델이라고 단정하지 않는다. 대안 조회 결과: MiniMax Music 3 $0.002/초(duration 상한, 조기 종료 가능), ElevenLabs Music v2.5 $0.60/분(분 단위 올림), ACE-Step $0.0002/초.

권장 입력은 prompt, duration=150, output_format=wav, seed, num_inference_steps=8, enable_prompt_expansion=false, enable_safety_checker=true, sync_mode=false다. endpoint schema를 실제 구현 때 다시 읽는다.

## 전송·저장 경계

prompt/settings만 전송하며 사용자 참조 음원을 업로드하지 않는다. MCP 생성은 submit_job→check_job→get_job_result로 같은 request ID를 추적한다. `store_payload:false`, `expiration_seconds:86400`을 사용한다. backend는 `FAL_KEY`를 비밀 환경 변수로 받으며 frontend/URL/로그에 노출하지 않는다.

- [Fal 보관 설정](https://fal.ai/docs/documentation/model-apis/media-expiration): JSON IO 보관과 media 보관은 별개, backend `X-Fal-Store-IO: 0` 사용.
- [Fal CDN](https://fal.ai/docs/documentation/model-apis/fal-cdn): 공식 예시 fal.media, v3.fal.media, v3b.fal.media. HTTPS/host/IP/redirect 검사와 bounded streaming 필요.
- [Queue](https://fal.ai/docs/documentation/model-apis/inference/queue): 실행 중 취소와 과금 중단은 보장하지 않는다. 앱 자동 재요청 금지.
- [Fal 약관](https://fal.ai/legal/terms-of-service): 결과 독창성·비침해 보증으로 표현하지 않는다.

WAV 응답의 MIME이 application/octet-stream일 수 있어 실제 RIFF/WAVE bytes로 검사한다. 원격 URL을 DB의 원본 경로로 저장하지 않는다.

## 테스트 제작 제안

사용자의 모든 장르 요청은 앱 장르 프리셋 16개 전체와 참고 방향 4곡으로 구체화한다. 각 150초, instrumental, 독창적인 멜로디·편곡으로 구성한다. 아래 BPM은 요청값이며 실제 분석값이 아니다.

| 번호 | 장르 / 제목 | 콘셉트 |
|---|---|---|
| 01 | Hip-hop / Raincheck Avenue | 비 갠 골목, 88 BPM, 재즈 피아노·스윙 드럼 |
| 02 | Trap / Chrome Skyline | 밤의 고층도로, 142 BPM, 808 글라이드·금속 플럭 |
| 03 | R&B / Soul / Velvet Balcony | 늦은 밤 발코니, 76 BPM, Rhodes·부드러운 베이스 |
| 04 | Pop / Weekend Postcard | 바다 여행 출발, 112 BPM, 기타·밝은 신스 훅 |
| 05 | Rock / Last Train Sparks | 막차를 향한 질주, 128 BPM, 라이브 드럼·기타 리프 |
| 06 | Funk / Orange Roller | 롤러스케이트장, 106 BPM, 슬랩베이스·와우 기타·브라스 |
| 07 | Jazz / Blue Hour Table | 문 닫기 전 재즈바, 92 BPM, 피아노·브러시·색소폰 |
| 08 | House / Rooftop First Light | 옥상 일출, 124 BPM, four-on-floor·피아노 코드 |
| 09 | Techno / Concrete Pulse | 지하 공간, 132 BPM, 모듈러 신스·타이트한 킥 |
| 10 | Drum & Bass / Night Bus Aurora | 야간버스 창밖, 172 BPM, 패드·브레이크·서브 |
| 11 | Ambient / Tide Memory | 조수와 기억, 자유 템포, 드론·펠트 피아노 |
| 12 | Cinematic / Beyond the Ridge | 능선 너머 발견, 84 BPM, 현악·호른·타악 빌드 |
| 13 | Acoustic / Folk / Window Garden | 아침 창가 정원, 96 BPM, 핑거스타일·셰이커·첼로 |
| 14 | Classical / Paper Constellations | 종이별을 잇는 밤, 72 BPM, 피아노·현악 사중주 |
| 15 | Latin / Mercado Sunset | 저녁 시장, 100 BPM, 라틴 타악·나일론 기타 |
| 16 | Reggae / Dub / Saltwater Echo | 해안 산책, 74 BPM, 오프비트 기타·깊은 베이스·딜레이 |
| 17 | 그루비룸 참고 / Midnight Switch | 140 BPM, 트랩/R&B·808·세밀한 하이햇·몽환적 플럭 |
| 18 | 그루비룸 참고 / Glass Lobby | 100 BPM, 바운스 힙합·전자 피아노·드럼 공백 |
| 19 | 천재노창 참고 / Broken Neon Diary | 82 BPM, 실험 힙합·거친 드럼·불안정 피아노·편곡 전환 |
| 20 | 천재노창 참고 / Paper Moon Static | 118 BPM, 사이키델릭 전자 힙합·비틀린 베이스·질감 변화 |

참고 방향은 음악적 속성으로 풀어 프롬프트를 작성하며 원곡 샘플·멜로디·음성 복제는 하지 않는다. 파일/업로드 제목과 artist는 해당 프로듀서 참여를 암시하지 않는다.

## 다운로드 패키지와 실제 검증

후속 제작 계획에서 Downloads의 전용 폴더에 Upload_WAV, Metadata, Provenance를 만든다. 각 곡 제목·장르·콘셉트·설명·태그와 실제 길이·sample rate·channels·peak·SHA256, model·request ID·seed·생성일을 기록한다. 비밀 키/원격 URL은 공개 메타데이터에 넣지 않는다.

[SoundCloud 업로드 요구](https://help.soundcloud.com/hc/en-us/articles/360039171614-Upload-Requirements)는 무손실 stereo WAV/FLAC, 최소 16bit/44.1kHz, headroom을 권장한다. 실제 오디오 길이 90–180초, 디코딩, 클리핑·긴 무음·종료를 검사한다. MP3를 변환해 원래부터 무손실이었다고 표시하지 않는다.

이번 요청은 일반 업로드용 파일 준비다. SoundCloud for Artists 수익화·외부 유통 승인을 보장하지 않는다. [AI distribution 제한](https://help.soundcloud.com/hc/en-us/articles/48881707977627-Distribution-Rejections-How-to-Resolve-Them), [AI partners](https://help.soundcloud.com/hc/en-us/articles/22353035482523-DAW-AI-Integrations).
