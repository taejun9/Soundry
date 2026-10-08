/**
 * SQLite 연결·migration·데이터 폴더 단일 소유권을 함께 관리한다.
 * 복구와 파일 청소는 DB 잠금과 schema 검증이 성공한 뒤에만 수행하며, 종료는 작업 관리자 정리 이후에 이루어진다.
 */
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

  // 두 번째 서버가 migration이나 orphan 삭제를 시작하지 못하도록 첫 schema 조회보다 먼저 EXCLUSIVE 잠금을 잡는다.
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
      // 다른 앱의 DB나 미래 schema를 자동 변환/초기화하지 않는다. migration 이력과 버전이 맞는 DB만 연다.
      const version = this.client.pragma('user_version', { simple: true });
      const tables = this.client.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
      if (typeof version !== 'number' || version > 3 || (tables.length > 0 && !tables.some((table) => table.name === '__drizzle_migrations'))) {
        throw new Error('UNSUPPORTED_DATABASE_SCHEMA');
      }
      this.client.pragma('journal_mode = WAL');
      this.db = drizzle(this.client, { schema });
      migrate(this.db, { migrationsFolder: join(REPOSITORY_ROOT, 'backend', 'migrations') });
      if (this.client.pragma('user_version', { simple: true }) !== 3) throw new Error('UNSUPPORTED_DATABASE_SCHEMA');
      this.client.prepare('SELECT id FROM composition_knowledge LIMIT 1').get();
      this.client.prepare('SELECT generation_id FROM generation_knowledge LIMIT 1').get();
      this.client.prepare('SELECT generation_id FROM generation_scores LIMIT 1').get();
      // Verify v2 tables and ownership columns before cleanup touches any audio.
      this.client.prepare('SELECT id FROM members LIMIT 1').get();
      this.client.prepare('SELECT token_hash FROM sessions LIMIT 1').get();
      this.client.prepare('SELECT generation_id FROM usage_entries LIMIT 1').get();
      this.client.prepare('SELECT project_id FROM arrangements LIMIT 1').get();
      this.client.prepare('SELECT member_id FROM projects LIMIT 1').get();
      this.client.prepare('SELECT member_id FROM generations LIMIT 1').get();
      // Verify the required tables before touching any audio files.
      this.db.select().from(schema.projects).limit(1).all();
      this.db.select().from(schema.generations).limit(1).all();
      // 실제 테이블을 읽을 수 있는지 확인한 후에만 참조 집합을 만들어 파일 청소를 허용한다.
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

  // 동일 밀리초 안의 연속 변경도 최신 목록에 반영되도록 수정 시각을 최소 1ms 증가시킨다.
  touchProject(id: string): void {
    const current = this.db.select({ updatedAt: schema.projects.updatedAt }).from(schema.projects).where(eq(schema.projects.id, id)).get();
    if (!current) return;
    const next = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
    this.db.update(schema.projects).set({ updatedAt: next }).where(eq(schema.projects.id, id)).run();
  }

  // 종료 훅이 중복 호출되어도 이미 닫힌 연결을 다시 닫지 않는다.
  onApplicationShutdown(): void {
    if (this.client.open) this.client.close();
  }
}
