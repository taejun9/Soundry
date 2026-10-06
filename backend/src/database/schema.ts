/**
 * Drizzle에서 사용하는 SQLite 타입/제약 정의다. 실행 SQL은 버전 관리된 migrations와 함께 유지한다.
 * Project → Generation → Track 관계를 통해 요청 snapshot과 결과 metadata를 분리하고 원본 이력은 별도로 보존한다.
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

// 프로젝트 이름은 표시용이라 중복 가능하다. 최신순 탐색은 updatedAt과 UUID를 함께 사용한다.
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  memberId: text('member_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  check('projects_name_length', sql`length(trim(${table.name})) between 1 and 120`),
  index('projects_updated_at_id').on(table.updatedAt, table.id),
]);

// requestKey는 프로젝트 내에서만 유일하다. 재시도는 새 row로 만들고 원본 삭제 시 source 참조만 NULL로 바꾼다.
export const generations = sqliteTable('generations', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  memberId: text('member_id'),
  settingsJson: text('settings_json').notNull(),
  provider: text('provider').notNull(),
  model: text('model'),
  status: text('status', { enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'] }).notNull(),
  variationCount: integer('variation_count').notNull(),
  requestKey: text('request_key').notNull(),
  sourceGenerationId: text('source_generation_id').references((): AnySQLiteColumn => generations.id, { onDelete: 'set null' }),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull(),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
}, (table) => [
  check('generations_prompt_length', sql`length(${table.prompt}) between 1 and 4000`),
  check('generations_settings_json', sql`json_valid(${table.settingsJson})`),
  check('generations_status', sql`${table.status} in ('queued', 'processing', 'completed', 'failed', 'cancelled')`),
  check('generations_variations', sql`${table.variationCount} between 1 and 4`),
  uniqueIndex('generations_project_request_key').on(table.projectId, table.requestKey),
  index('generations_project_created_at').on(table.projectId, table.createdAt),
]);

// Track에는 실제 확인된 결과만 기록한다. 알 수 없는 BPM/seed 등은 NULL이며 요청 설정을 결과로 복제하지 않는다.
// variation index와 audio path의 유일성은 batch 중복 반영 및 파일 경로 공유를 DB에서도 차단한다.
export const tracks = sqliteTable('tracks', {
  id: text('id').primaryKey(),
  generationId: text('generation_id').notNull().references(() => generations.id, { onDelete: 'cascade' }),
  variationIndex: integer('variation_index').notNull(),
  title: text('title').notNull(),
  audioPath: text('audio_path').notNull(),
  mimeType: text('mime_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  durationSeconds: real('duration_seconds'),
  bpm: real('bpm'),
  genre: text('genre'),
  mood: text('mood'),
  seed: text('seed'),
  provider: text('provider').notNull(),
  model: text('model'),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
}, (table) => [
  check('tracks_favorite', sql`${table.favorite} in (0, 1)`),
  check('tracks_variation_index', sql`${table.variationIndex} between 0 and 3`),
  check('tracks_byte_size', sql`${table.byteSize} > 0`),
  uniqueIndex('tracks_generation_variation').on(table.generationId, table.variationIndex),
  uniqueIndex('tracks_audio_path').on(table.audioPath),
  index('tracks_generation').on(table.generationId),
  index('tracks_favorite_created_at').on(table.favorite, table.createdAt),
]);
