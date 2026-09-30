# Music generation provider 계약

아래 TypeScript는 설계 예시이며 실행 코드가 아니다. adapter는 backend 전용이고 UI에는 JSON capabilities와 DTO만 전달한다.

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

- backend/fixtures/audio에 자체 제작 짧은 PCM WAV 2–4개와 제작 근거를 둔다. fixture는 작고 소스가 재현 가능해야 한다.
- 요청마다 재생 가능한 실제 bytes를 반환한다. 빈 URL이나 가짜 성공만 반환하지 않는다.
- UI에 `Mock / demo-fixture`를 표시한다. prompt가 곡을 바꿨다거나 실제 AI 결과라고 주장하지 않는다.
- prompt-only 요청으로 기본 동작하며 mock가 반영할 수 없는 BPM/seed/vocal 등은 capabilities에서 비활성화한다.
- variationCount에 맞춰 fixture를 순환 반환한다. fixture의 실제 길이만 metadata로 기록한다.
- 테스트에서 지연·실패·취소·잘못된 bytes를 제어할 수 있게 dependency를 주입하되 실제 앱 UI에 디버그 옵션을 노출할 필요는 없다.
- 어떠한 외부 네트워크·키 없이 workflow를 끝낼 수 있어야 한다.

## 실제 provider 도입 gate

Phase 8에서 fal.ai, local model 또는 다른 API 중 하나를 선택하고 endpoint의 공식 문서·모델명·입출력 schema·포맷·취소·시간 제한·비용·이용 조건을 기록한다. 지금은 fal adapter나 특정 모델명·요금을 만들어 넣지 않는다.

외부 provider이면 프롬프트와 선택 설정이 전송된다는 설명을 생성 UI에 표시한다. key는 backend `.env`에만 둔다. 참조 오디오 전송은 현재 범위에 없으므로 구현하지 않는다. 자동 재시도는 없고 사용자의 Retry는 새 작업/외부 비용을 발생시킬 수 있다.

원격 URL은 adapter가 검증한 공급자 host/HTTPS에서만 가져온다. redirect 대상도 같은 정책으로 검사하고 내부 주소를 거부한다. 파일을 bounded streaming으로 받아 media signature·크기·포맷을 검증한다. 앱 전체 기본 파일 상한은 track당 100 MiB로 두되 모델 선정 시 예상 길이에 맞춰 명시적으로 재검토한다. 이를 통과한 결과를 StorageService에 전달하며 원격 URL을 영구 audioPath로 저장하지 않는다.

provider가 취소를 지원하지 않더라도 로컬 결과 수집을 중단하고 늦은 성공을 폐기한다. UI는 로컬 취소와 공급자 과금 중단을 같은 뜻으로 표시하지 않는다. 재시작 후 외부 job이 계속될 수 있으므로 자동 중복 요청은 하지 않는다.
