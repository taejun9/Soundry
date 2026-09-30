CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CONSTRAINT projects_name_length CHECK (length(trim(name)) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX projects_updated_at_id ON projects(updated_at, id);
--> statement-breakpoint
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
CREATE UNIQUE INDEX generations_project_request_key ON generations(project_id, request_key);
--> statement-breakpoint
CREATE INDEX generations_project_created_at ON generations(project_id, created_at);
--> statement-breakpoint
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
CREATE UNIQUE INDEX tracks_generation_variation ON tracks(generation_id, variation_index);
--> statement-breakpoint
CREATE UNIQUE INDEX tracks_audio_path ON tracks(audio_path);
--> statement-breakpoint
CREATE INDEX tracks_generation ON tracks(generation_id);
--> statement-breakpoint
CREATE INDEX tracks_favorite_created_at ON tracks(favorite, created_at);
--> statement-breakpoint
PRAGMA user_version = 1;
