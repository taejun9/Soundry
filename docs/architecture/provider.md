# Music generation provider 계약

Phase 4에서 backend 전용 provider 계약과 MockProvider를 구현했다. 실행 계약은 `backend/src/providers/music-generation-provider.ts`에 있으며, 아래 코드는 그 책임을 설명한다. UI에는 JSON capabilities와 DTO만 전달한다.

```ts
type MusicMode = 'instrumental' | 'vocal';
type SettingKey = 'genre' | 'mood' | 'bpm' | 'durationSeconds' | 'seed';

interface GenerationSettings {
  mode?: MusicMode;
  genre?: string;
  mood?: string;
  bpm?: number;
  durationSeconds?: number;
  seed?: string;
}

interface GenerationInput {
  prompt: string;
  settings: GenerationSettings;
  variationCount: number;
}

interface ProviderCapabilities {
  modes: readonly MusicMode[];
  settings: readonly SettingKey[];
  maxVariations: number;
  durationRangeSeconds?: { min: number; max: number };
  bpmRange?: { min: number; max: number };
  seedSupported: boolean;
  canCancelRemote: boolean;
}

interface ProviderContext {
  signal: AbortSignal;
  onStage(stage: 'generating' | 'saving'): void;
}

interface ProviderTrack {
  audio: AsyncIterable<Uint8Array>;
  mediaType: 'audio/wav' | 'audio/mpeg';
  extension: 'wav' | 'mp3';
  model: string;
  metadata: {
    durationSeconds?: number;
    bpm?: number;
    genre?: string;
    mood?: string;
    seed?: string;
  };
}

interface MusicGenerationProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  generate(input: GenerationInput, context: ProviderContext): Promise<readonly ProviderTrack[]>;
}
```

## 책임과 계약

Soundry는 job ID, project ID, 경로, filename, DB transaction을 소유한다. provider는 오디오 source와 실제 metadata만 반환한다. stream은 반드시 context.signal 취소를 존중하며 서비스가 consuming 중이어도 timeout이 적용된다. 반환 count는 variationCount와 같아야 하고 각 stream은 한 번 소비한다.

기본 앱 제한은 variations 1–4, prompt 1–4000자다. 숫자는 finite 값만 허용한다. 실제 범위는 provider capabilities와 앱 상한의 교집합이다. seed는 문자열로 보존하고 해당 모델 adapter에서 형식을 검증한다. 지원하지 않는 설정을 조용히 무시하지 않고 UI에서 비활성화하고 API에서 400을 반환한다.

공급자 선택은 backend config 하나로 한다. MVP에 사용자 플러그인 로더나 임의 endpoint 입력 기능은 없다. browser에 인증 키, 내부 경로, provider 응답 전체를 주지 않는다.

## MockProvider

- `backend/fixtures/audio`의 자체 제작 8초 stereo PCM16/44100Hz WAV 두 개를 사용한다. `generate.mjs`로 재현하고 manifest SHA256과 `npm run qa:audio`로 독립 검증한다. 사용자 요청 테스트곡이나 AI 생성 결과로 표시하지 않는다.
- 요청마다 재생 가능한 실제 bytes를 반환한다. 빈 URL이나 가짜 성공만 반환하지 않는다.
- UI에 `Mock / demo-fixture`를 표시한다. prompt가 곡을 바꿨다거나 실제 AI 결과라고 주장하지 않는다.
- prompt-only 요청으로 기본 동작하며 mock가 반영할 수 없는 BPM/seed/vocal 등은 capabilities에서 비활성화한다.
- variationCount에 맞춰 fixture를 순환 반환한다. fixture의 실제 길이만 metadata로 기록한다.
- 테스트에서 지연·실패·취소·잘못된 bytes를 제어할 수 있게 dependency를 주입하되 실제 앱 UI에 디버그 옵션을 노출할 필요는 없다.
- 어떠한 외부 네트워크·키 없이 workflow를 끝낼 수 있어야 한다.

## Codex CLI 작곡 공급자

2026-10-01 사용자 요청으로 유료 음악 API를 제외했다. `cli`는 설치된 Codex CLI를 shell 없이 실행하고 stdin으로 프롬프트·선택 설정을 전달한다. 기존 ChatGPT 로그인만 허용하며 API 키 환경변수를 전달하지 않는다. 기본 provider는 cli, 명시적 mock은 계속 지원한다.

CLI 응답은 JSON schema로 제한된 악보다. Soundry는 섹션·패턴·악기·음표의 타입/범위/개수/연산량을 다시 검증한 뒤 자체 renderer로 stereo 44.1kHz PCM16 WAV를 만든다. 모델이 반환한 코드나 명령을 실행하지 않는다. 고정 fixture 복제나 음원 반복 연장으로 실제 작곡 성공을 대신하지 않는다.

기능은 instrumental, genre/mood, BPM 40–220, duration 90–180초(기본150), seed 문자열 최대64자, variations1–4다. BPM은 실제 합성에 사용된 악보 tempo이며 오디오 분석값을 추정한 것이 아니다. seed는 합성의 미세 연주·음색 재현에 사용하며 같은 LLM 출력까지 보장하지 않는다.

CLI는 빈 전용 임시 폴더, read-only sandbox, 명시적 비대화형 실행, 개인 config·MCP·shell 등 도구 비활성화, 제한된 환경·출력 크기·시간을 사용한다. 앱은 인증 파일을 읽거나 복사하지 않는다. 사용자 기본 CLI 설정을 수정하지 않으며 기존 실행 안전 규칙을 무시하지 않는다. 취소 시 현재 subprocess를 종료하고 늦은 결과를 버린다. renderer도 반복적으로 event loop를 양보하고 AbortSignal을 검사한다.

설치/로그인 상태를 비동기로 확인해 기존 프로젝트·재생 화면을 막지 않는다. 미준비 상태에서 신규 생성은 명확히 거부하지만, 이미 접수한 동일 requestKey는 기존 작업을 반환한다. 실패 시 원시 stderr·내부 경로·프롬프트를 공개하지 않고 정제한 오류를 표시한다. 자동 새 요청·유료 API fallback은 없다.

CLI를 통한 텍스트 추론에는 기존 계정의 전송 정책과 사용 한도가 적용된다. 완전 오프라인·무제한 무료 음악 모델이라고 표시하지 않는다. 음원 합성과 저장은 로컬이며 노래·가창은 지원하지 않는다. 실제 작곡부터 저장·재생·다운로드까지 검증한 뒤 완료로 기록한다.

### 정확한 끝 길이

마지막 패턴 반복이 요청 범위 안에서 시작한다면 남은 부분은 정확한 종료 시점에서 잘라 마감한다. 끝부터 시작하는 추가 반복은 거부한다. 전체마디/악보다양성/이벤트·동시발음·총발음시간 제한은 유지하며 명시BPM의 총마디수는 앱이 계산해 CLI에 안내한다.

## 교체 가능한 작곡 LLM — plan-019

`ollama` 공급자는 로컬 Gemma 등 미리 설치한 LLM의 JSON 악보를 같은 검증기/합성기로 처리한다. CLI는 항목별 전송에 동의한 회원 지식만 RAG로 참고하고 Ollama는 로컬 지식을 참고한다. 새 결과는 검증된 악보 JSON·MIDI와 참고 항목 식별자를 내보낸다. 준비 확인·전송·검색·미검증 품질은 [작곡 기억 설계](composition-memory.md)를 따른다.

## llama.cpp — 2026-10-09

`llamacpp`는사용자가8089에구동한Gemma를직접사용한다. 준비상태와실제모델ID를확인해공개된basename출처를기록한다. 기존RAG/악보검증/로컬합성/JSON/MIDI를재사용하며임의URL·원격fallback·서버관리API는추가하지않는다. [작곡기억의llama.cpp연결](composition-memory.md)을따른다.

## Gemma 표현력 복원 — plan-023

llamacpp는 `sectional-v2` 출력프로필을사용한다. [작곡기억의품질복원](composition-memory.md)을따른다. 기존renderer/canonicalJSON/MIDI와원본은유지하며형식안정화를위한6음표제약을제거한다. 초기실제한곡717초를확인해capabilitymaxVariations를1로조정했다. 한곡compose는16분,각단계240초,전체job20분을지켜타임아웃·취소이후결과를공개하지않는다. 출력형식범위가커졌다는사실만으로음악품질동등성을표시하지않는다. CLI한도4와명시선택/전송동의정책은유지한다.

## 원본 스타일 유지와 선율 다듬기 — plan-023

llamacpp에서같은프로젝트의완료작업입력을가져오면첫완성canonical악보가있는경우`reference-v3`를사용한다. 원본의장르·BPM·길이를유지해야하며불일치는추론전에400으로거부한다. 원본참조해제로독립`sectional-v2`작곡을선택할수있다. mock/실패/다른프로젝트참조는스타일악보가될수없다. 다른공급자에는참조악보를자동전송하지않는다.

원본편성·구간·리듬·gate·강약·mix·bass/drums/pad/organ·동시화음과보호악기의공유패턴을유지한다. 단선율slot에실제반주pitchclass를제공하며프레이즈마지막pitch를anchor로보존한다. Gemma가새pitch초안후polish를작성하고최종후보가잘못된경우한번만repair한다. 최소1/3의slotpitch를변경해야하며원본을변경하지않는다. 반환출처는reference-v3로기록하고새선율변주임을화면과패키지에표시한다. 전체편곡또는전체음표를Gemma독립작성으로표시하지않으며음악성동등성은청취로별도판단한다.
