/**
 * 두 앱이 type-only import로 공유하는 JSON DTO 계약이다.
 * Date·Node 객체·DB schema를 포함하지 않으며 실제 입력 검증은 backend 책임이다.
 * 시간은 UTC ISO 문자열, 알려지지 않은 결과 metadata는 null로 교환한다.
 */
/** 서버 준비 확인 응답. 외부 공급자의 로그인·작곡 가능 여부와는 별개다. */
export interface HealthResponse {
  status: 'ok';
  service: 'soundry-api';
}

/** 클라이언트가 분기할 안정적인 code와 사용자용으로 정제한 message만 노출한다. */
export interface ApiErrorResponse {
  error: { code: string; message: string };
}

/** 목록과 상세에서 공유하는 프로젝트 표시값. trackCount는 서버의 현재 집계다. */
export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  trackCount: number;
}

/** nextCursor가 null이면 마지막 페이지다. cursor 자체는 클라이언트가 해석하지 않는다. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** DB 삭제 성공과 별개로 파일 정리가 남았는지를 알려 재시작 정리 안내에 사용한다. */
export interface DeleteResult {
  deleted: true;
  cleanupPending: boolean;
}

/** 실제 선택 가능 여부는 현재 provider의 capabilities를 함께 확인해야 한다. */
export type MusicMode = 'instrumental' | 'vocal';
export type SettingKey = 'genre' | 'mood' | 'bpm' | 'durationSeconds' | 'seed';
/** 사용자의 선택 요청값. 생략한 설정은 provider 기본값을 쓰며 결과 실측값이 아니다. */
export interface GenerationSettings {
  mode?: MusicMode;
  genre?: string;
  mood?: string;
  bpm?: number;
  durationSeconds?: number;
  seed?: string;
}
/** 생성·재시도·재생성이 보존하는 입력 snapshot. variationCount는 요청 결과 수다. */
export interface GenerationInput {
  prompt: string;
  settings: GenerationSettings;
  variationCount: number;
}
/** UI와 API가 같은 제약으로 입력을 제한하도록 공개하는 공급자 지원 범위다. */
export interface ProviderCapabilities {
  modes: MusicMode[];
  settings: SettingKey[];
  maxVariations: number;
  durationRangeSeconds?: { min: number; max: number };
  bpmRange?: { min: number; max: number };
  seedSupported: boolean;
  canCancelRemote: boolean;
}
/** configured와 generationEnabled를 구분해 설치/로그인과 실제 생성 허용 상태를 알린다. */
export interface ProviderSummary {
  id: string;
  model: string | null;
  isMock: boolean;
  configured: boolean;
  generationEnabled: boolean;
  capabilities: ProviderCapabilities;
  notice: string;
}

/** DB에 보존하는 상태. completed·failed·cancelled 이후에는 새 작업으로만 재시도한다. */
export type GenerationStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
/** 처리 중 표시할 일시적인 단계이며 검증되지 않은 백분율을 대신 만들지 않는다. */
export type GenerationStage = 'preparing' | 'generating' | 'saving';
/** 동일 입력 재전송은 같은 requestKey, 명시적인 새 생성은 새 키를 사용한다. */
export interface CreateGenerationRequest extends GenerationInput {
  requestKey: string;
  /** 선택한 원본 이력의 식별자. 원본 입력이나 결과를 덮어쓰지 않는다. */
  sourceGenerationId?: string;
}
/** 저장 완료 음원의 공개 표시값. 내부 audioPath 대신 ID 기반 로컬 API URL만 제공한다. */
export interface TrackSummary {
  id: string;
  projectId: string;
  generationId: string;
  /** 같은 generation 안에서 0부터 시작하는 결과 순서다. */
  variationIndex: number;
  title: string;
  prompt: string;
  audioUrl: string;
  downloadUrl: string;
  mimeType: string;
  byteSize: number;
  /** 파일/공급자에서 확인한 값만 기록하며 요청 길이를 실측값으로 대체하지 않는다. */
  durationSeconds: number | null;
  bpm: number | null;
  genre: string | null;
  mood: string | null;
  seed: string | null;
  provider: string;
  model: string | null;
  favorite: boolean;
  createdAt: string;
}
/** 원본 입력과 진행/종료 상태 및 결과를 묶는다. 결과를 지워도 생성 이력은 남는다. */
export interface GenerationSummary {
  id: string;
  projectId: string;
  prompt: string;
  settings: GenerationSettings;
  variationCount: number;
  requestKey: string;
  sourceGenerationId: string | null;
  provider: string;
  model: string | null;
  status: GenerationStatus;
  stage: GenerationStage | null;
  /** 현재 공급자는 신뢰할 수 있는 정량 진행률을 제공하지 않는다. */
  progress: null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  tracks: TrackSummary[];
}

/** 상세 화면은 요청 설정과 실제 결과 metadata를 구분해 재사용·비교한다. */
export interface TrackDetail extends TrackSummary {
  requestedSettings: GenerationSettings;
  requestedVariationCount: number;
}
/** 명시한 필드만 수정한다. 제목 변경은 저장된 원본 파일명이나 bytes를 바꾸지 않는다. */
export interface UpdateTrackRequest {
  title?: string;
  favorite?: boolean;
}
/** 별도 프롬프트 저장본 없이 Generation에서 투영한 재사용 목록 항목이다. */
export interface PromptSummary {
  generationId: string;
  prompt: string;
  settings: GenerationSettings;
  variationCount: number;
  status: GenerationStatus;
  trackCount: number;
  createdAt: string;
}

/** 프로젝트를 넘나드는 보관함에서 출처를 표시하기 위한 추가 이름이다. */
export interface LibraryTrackSummary extends TrackSummary {
  projectName: string;
}

// Local membership and layered audio arrangement contracts.
export type MembershipTier = 'free' | 'plus' | 'pro' | 'admin';
export interface MemberSummary { id: string; email: string; name: string; tier: MembershipTier; createdAt: string }
export interface MembershipPlan { tier: MembershipTier; name: string; monthlyLimit: number | null }
export interface UsageSummary { month: string; used: number; limit: number | null; remaining: number | null }
export interface SessionSummary { member: MemberSummary | null; setupRequired: boolean; usage: UsageSummary | null }
export interface ArrangementClip { id: string; trackId: string; label: string; start: number; offset: number; duration: number; volume: number; loop: boolean }
export interface ArrangementLane { id: string; name: string; muted: boolean; clips: ArrangementClip[] }
export interface Arrangement { duration: number; lanes: ArrangementLane[] }
