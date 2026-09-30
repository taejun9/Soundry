import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import BetterSqlite3 from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { join } from 'node:path';
import { REPOSITORY_ROOT, StorageConfig } from '../config/storage-config.js';
import * as schema from './schema.js';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly client: BetterSqlite3.Database;
  readonly db: BetterSQLite3Database<typeof schema>;

  constructor(@Inject(StorageConfig) storage: StorageConfig) {
    storage.assertSafe();
    this.client = new BetterSqlite3(storage.databasePath);
    try {
      this.client.pragma('busy_timeout = 1000');
      // Acquire before schema reads, recovery, or file cleanup. Held until close.
      this.client.pragma('locking_mode = EXCLUSIVE');
      this.client.exec('BEGIN EXCLUSIVE; COMMIT;');
      this.client.pragma('foreign_keys = ON');
      this.client.pragma('busy_timeout = 5000');
      const version = this.client.pragma('user_version', { simple: true });
      const tables = this.client.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
      if (typeof version !== 'number' || version > 1 || (tables.length > 0 && !tables.some((table) => table.name === '__drizzle_migrations'))) {
        throw new Error('UNSUPPORTED_DATABASE_SCHEMA');
      }
      this.client.pragma('journal_mode = WAL');
      this.db = drizzle(this.client, { schema });
      migrate(this.db, { migrationsFolder: join(REPOSITORY_ROOT, 'backend', 'migrations') });
      if (this.client.pragma('user_version', { simple: true }) !== 1) throw new Error('UNSUPPORTED_DATABASE_SCHEMA');
      // Verify the required tables before touching any audio files.
      this.db.select().from(schema.projects).limit(1).all();
      this.db.select().from(schema.generations).limit(1).all();
      const references = this.db.select({ path: schema.tracks.audioPath }).from(schema.tracks).all();
      const staleTempPending = storage.removeStaleTemp();
      if (storage.removeOrphanAudio(new Set(references.map((track) => track.path))) || staleTempPending) {
        console.warn('Soundry: 일부 음원을 정리하지 못했습니다. 저장 폴더의 권한과 파일 상태를 확인해 주세요.');
      }
    } catch (error) {
      this.client.close();
      if (error instanceof Error && 'code' in error && error.code === 'SQLITE_BUSY') throw new Error('DATA_DIRECTORY_IN_USE', { cause: error });
      throw error;
    }
  }

  touchProject(id: string): void {
    const current = this.db.select({ updatedAt: schema.projects.updatedAt }).from(schema.projects).where(eq(schema.projects.id, id)).get();
    if (!current) return;
    const next = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
    this.db.update(schema.projects).set({ updatedAt: next }).where(eq(schema.projects.id, id)).run();
  }

  onApplicationShutdown(): void {
    if (this.client.open) this.client.close();
  }
}
