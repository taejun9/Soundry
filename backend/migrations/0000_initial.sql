-- 초기 schema v1: 프로젝트 표시 정보와 최신순 탐색 키를 저장한다. 이름은 고유 식별자가 아니다.
CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CONSTRAINT projects_name_length CHECK (length(trim(name)) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX projects_updated_at_id ON projects(updated_at, id);
--> statement-breakpoint
-- 생성 입력과 최종 상태는 이력이다. 프로젝트 삭제는 소속 생성 row로 cascade하며 source 참조는 원본 삭제 시 NULL이 된다.
CREATE TABLE generations (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL CONSTRAINT generations_prompt_length CHECK (length(prompt) BETWEEN 1 AND 4000),
  settings_json TEXT NOT NULL CONSTRAINT generations_settings_json CHECK (json_valid(settings_json)),
  provider TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL CONSTRAINT generations_status CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  variation_count INTEGER NOT NULL CONSTRAINT generations_variations CHECK (variation_count BETWEEN 1 AND 4),
  request_key TEXT NOT NULL,
  source_generation_id TEXT REFERENCES generations(id) ON DELETE SET NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
--> statement-breakpoint
-- 같은 프로젝트의 요청 키 재전송이 중복 작업 row를 만들지 못하도록 DB에서도 유일성을 보장한다.
CREATE UNIQUE INDEX generations_project_request_key ON generations(project_id, request_key);
--> statement-breakpoint
CREATE INDEX generations_project_created_at ON generations(project_id, created_at);
--> statement-breakpoint
-- 확인된 음원 metadata와 UUID 상대 경로만 저장한다. 미확인 BPM/장르/seed는 NULL이고 요청 설정은 generation에 남긴다.
CREATE TABLE tracks (
  id TEXT PRIMARY KEY NOT NULL,
  generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  variation_index INTEGER NOT NULL CONSTRAINT tracks_variation_index CHECK (variation_index BETWEEN 0 AND 3),
  title TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CONSTRAINT tracks_byte_size CHECK (byte_size > 0),
  duration_seconds REAL,
  bpm REAL,
  genre TEXT,
  mood TEXT,
  seed TEXT,
  provider TEXT NOT NULL,
  model TEXT,
  favorite INTEGER NOT NULL DEFAULT 0 CONSTRAINT tracks_favorite CHECK (favorite IN (0, 1)),
  created_at TEXT NOT NULL
);
--> statement-breakpoint
-- variation 중복 및 하나의 원본 파일을 여러 트랙이 공유하는 상태를 차단한다.
CREATE UNIQUE INDEX tracks_generation_variation ON tracks(generation_id, variation_index);
--> statement-breakpoint
CREATE UNIQUE INDEX tracks_audio_path ON tracks(audio_path);
--> statement-breakpoint
CREATE INDEX tracks_generation ON tracks(generation_id);
--> statement-breakpoint
CREATE INDEX tracks_favorite_created_at ON tracks(favorite, created_at);
--> statement-breakpoint
-- 앱이 지원하는 schema 버전을 명시한다. 시작 시 미래 버전/다른 DB를 자동 초기화하지 않는다.
PRAGMA user_version = 1;
