import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  check('projects_name_length', sql`length(trim(${table.name})) between 1 and 120`),
  index('projects_updated_at_id').on(table.updatedAt, table.id),
]);

export const generations = sqliteTable('generations', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
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
