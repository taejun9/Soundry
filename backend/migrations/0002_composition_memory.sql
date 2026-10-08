CREATE TABLE composition_knowledge (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
 content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 4000),
 tags TEXT NOT NULL CHECK(length(tags) <= 200),
 source TEXT NOT NULL CHECK(length(source) BETWEEN 1 AND 300),
 rights TEXT NOT NULL CHECK(rights IN ('own','licensed','public-domain')),
 allow_remote INTEGER NOT NULL DEFAULT 0 CHECK(allow_remote IN (0,1)),
 rating INTEGER CHECK(rating BETWEEN 1 AND 5),
 track_id TEXT UNIQUE REFERENCES tracks(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX knowledge_member ON composition_knowledge(member_id,updated_at);
--> statement-breakpoint
CREATE TABLE generation_knowledge (
 generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, knowledge_id TEXT REFERENCES composition_knowledge(id) ON DELETE SET NULL,
 digest TEXT NOT NULL, rating INTEGER, PRIMARY KEY(generation_id,ordinal)
);
--> statement-breakpoint
CREATE TABLE generation_scores (
 generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
 variation_index INTEGER NOT NULL CHECK(variation_index BETWEEN 0 AND 3),
 score_json TEXT NOT NULL CHECK(json_valid(score_json)),
 PRIMARY KEY(generation_id,variation_index)
);
--> statement-breakpoint
PRAGMA user_version = 3;
