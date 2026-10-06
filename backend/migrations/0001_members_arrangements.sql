CREATE TABLE members (
 id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, tier TEXT NOT NULL CHECK(tier IN ('free','plus','pro','admin')), created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY NOT NULL, member_id TEXT NOT NULL REFERENCES members(id), expires_at TEXT NOT NULL);
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN member_id TEXT REFERENCES members(id);
--> statement-breakpoint
ALTER TABLE generations ADD COLUMN member_id TEXT REFERENCES members(id);
--> statement-breakpoint
CREATE TABLE usage_entries (generation_id TEXT PRIMARY KEY NOT NULL, member_id TEXT NOT NULL REFERENCES members(id), amount INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX usage_member_period ON usage_entries(member_id, created_at);
--> statement-breakpoint
CREATE TRIGGER usage_reserve AFTER INSERT ON generations WHEN NEW.member_id IS NOT NULL BEGIN
 INSERT INTO usage_entries VALUES(NEW.id, NEW.member_id, NEW.variation_count, NEW.status, NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER usage_settle AFTER UPDATE OF status ON generations BEGIN
 UPDATE usage_entries SET status = NEW.status WHERE generation_id = NEW.id;
END;
--> statement-breakpoint
CREATE TABLE arrangements (project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE, content_json TEXT NOT NULL CHECK(json_valid(content_json)), updated_at TEXT NOT NULL);
--> statement-breakpoint
PRAGMA user_version = 2;
