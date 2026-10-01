# 실제 생성 공급자와 테스트 음원 조사

현재 결정: 2026-10-01 사용자가 유료 음악 API를 제외하고 AI CLI 호출을 요청했다. Codex CLI의 기존 ChatGPT 로그인으로 JSON 악보를 작성하고, Soundry 자체 renderer가 로컬에서 WAV를 합성한다. Fal은 현재 구현·제작 경로에서 사용하지 않는다.

## 실행과 데이터 경계

설치된 Codex CLI 0.136.0의 ChatGPT 로그인 상태와 실제 제한 JSON 응답을 확인했다. shell 없는 subprocess, 빈 작업폴더, read-only sandbox, 개인 config 및 외부 tool 비활성화, stdin·output-schema를 사용한다. 실제 요청에서 tool item 없이 agent_message 하나와 정상 JSON을 받았다. 이는 연결 검증이며 완성 음악 검증과는 구분한다.

- [공식 비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode)
- [공식 인증 방식](https://learn.chatgpt.com/docs/auth)

추가 음악 API 비용·키·자동충전은 없다. 기존 계정 사용 한도와 텍스트 전송 정책은 적용된다. 로컬 합성은 악보의 화성·멜로디·드럼·섹션을 자체 악기로 연주하며 연주곡만 지원한다. 고정 Mock 데모와 CLI가 작곡한 결과는 명확히 구분한다.

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

현재 로컬 합성기는 고정 BPM과 자체 악기 음색을 사용한다. 콘셉트의 808 글라이드·와우 기타·자유 템포 같은 표현은 작곡 방향이며 해당 오디오 효과나 템포 자동화를 구현했다고 주장하지 않는다.
