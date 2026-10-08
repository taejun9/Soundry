import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CompositionKnowledge, GenerationInput, KnowledgeReference } from '../../../shared/contracts.js';
import { compositionMidi } from '../providers/composition/midi.js';
import type { Composition } from '../providers/composition/index.js';
import { AppError } from '../api-errors.js';
import { DatabaseService } from '../database/database.service.js';
import { record } from '../members/members.service.js';
import { retrieveKnowledge } from './retrieval.js';
import type { RetrievedKnowledge } from './retrieval.js';

type Row = { id: string; member_id: string; title: string; content: string; tags: string; source: string; rights: CompositionKnowledge['rights']; allow_remote: number; rating: number | null; track_id: string | null; created_at: string; updated_at: string };
const publicRow = (r: Row): CompositionKnowledge => ({ id: r.id, title: r.title, content: r.content, tags: r.tags, source: r.source, rights: r.rights, allowRemote: r.allow_remote === 1, rating: r.rating, trackId: r.track_id, createdAt: r.created_at, updatedAt: r.updated_at });
function text(value: unknown, maximum: number, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.trim().length > maximum || Array.from(value).some(c => { const n = c.charCodeAt(0); return n < 32 && n !== 9 && n !== 10 && n !== 13 || n === 127; })) throw new AppError(400, 'INVALID_INPUT', '텍스트 길이와 입력을 확인해 주세요.');
  return value.trim();
}
@Injectable()
export class KnowledgeService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  list(memberId: string): CompositionKnowledge[] {
    return (this.database.client.prepare('SELECT * FROM composition_knowledge WHERE member_id=? ORDER BY updated_at DESC,id LIMIT 500').all(memberId) as Row[]).map(publicRow);
  }
  private owned(id: string, memberId: string): Row {
    const row = this.database.client.prepare('SELECT * FROM composition_knowledge WHERE id=? AND member_id=?').get(id, memberId) as Row | undefined;
    if (!row) throw new AppError(404, 'NOT_FOUND', '작곡 지식을 찾을 수 없습니다.');
    return row;
  }
  save(memberId: string, body: unknown, id?: string): CompositionKnowledge {
    const input = record(body, ['title', 'content', 'tags', 'source', 'rights', 'allowRemote']);
    const value = { title: text(input.title, 120), content: text(input.content, 4000), tags: text(input.tags === undefined ? '' : input.tags, 200, true), source: text(input.source, 300) };
    if (typeof input.rights !== 'string' || !['own', 'licensed', 'public-domain'].includes(input.rights) || typeof input.allowRemote !== 'boolean') throw new AppError(400, 'INVALID_INPUT', '이용 권한과 외부 전송 동의를 확인해 주세요.');
    const now = new Date().toISOString();
    if (id) {
      this.owned(id, memberId);
      this.database.client.prepare('UPDATE composition_knowledge SET title=?,content=?,tags=?,source=?,rights=?,allow_remote=?,updated_at=? WHERE id=? AND member_id=?').run(value.title, value.content, value.tags, value.source, input.rights, Number(input.allowRemote), now, id, memberId);
    } else {
      if (this.list(memberId).length >= 500) throw new AppError(409, 'KNOWLEDGE_LIMIT', '작곡 지식은 회원별 최대 500개입니다. 기존 항목을 정리해 주세요.');
      id = randomUUID();
      this.database.client.prepare('INSERT INTO composition_knowledge(id,member_id,title,content,tags,source,rights,allow_remote,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, memberId, value.title, value.content, value.tags, value.source, input.rights, Number(input.allowRemote), now, now);
    }
    return publicRow(this.owned(id, memberId));
  }
  remove(id: string, memberId: string): { deleted: true } {
    this.owned(id, memberId);
    this.database.client.prepare('DELETE FROM composition_knowledge WHERE id=? AND member_id=?').run(id, memberId);
    return { deleted: true };
  }
  feedback(trackId: string, memberId: string, body: unknown): CompositionKnowledge {
    const input = record(body, ['rating', 'notes', 'allowRemote']);
    if (!Number.isInteger(input.rating) || Number(input.rating) < 1 || Number(input.rating) > 5 || typeof input.allowRemote !== 'boolean') throw new AppError(400, 'INVALID_INPUT', '평가는 1–5점과 전송 동의로 입력해 주세요.');
    const notes = text(input.notes, 4000);
    // Re-check ownership in the service, even when called outside HTTP guards.
    const track = this.database.client.prepare('SELECT t.title,t.genre,t.mood,g.provider FROM tracks t JOIN generations g ON g.id=t.generation_id JOIN projects p ON p.id=g.project_id WHERE t.id=? AND p.member_id=?').get(trackId, memberId) as { title: string; genre: string | null; mood: string | null; provider: string } | undefined;
    if (!track) throw new AppError(404, 'NOT_FOUND', '음원을 찾을 수 없습니다.');
    if (track.provider === 'mock') throw new AppError(400, 'MOCK_FEEDBACK', '고정 데모는 실제 작곡 학습 사례로 저장할 수 없습니다.');
    const existing = this.database.client.prepare('SELECT id FROM composition_knowledge WHERE track_id=? AND member_id=?').get(trackId, memberId) as { id: string } | undefined;
    const item = this.save(memberId, { title: track.title, content: notes, tags: [track.genre, track.mood].filter(Boolean).join(' '), source: '직접 청취 평가', rights: 'own', allowRemote: input.allowRemote }, existing?.id);
    this.database.client.prepare('UPDATE composition_knowledge SET rating=?,track_id=? WHERE id=? AND member_id=?').run(input.rating, trackId, item.id, memberId);
    return publicRow(this.owned(item.id, memberId));
  }
  forGeneration(id: string, memberId: string | null, input: GenerationInput, provider: string): RetrievedKnowledge[] {
    if (!memberId || !['cli','ollama','llamacpp'].includes(provider)) return [];
    const knowledge = this.list(memberId).map(item => {
      if (!item.trackId) return item;
      try { return { ...item, content: item.content + '\nEvaluated arrangement structure: ' + this.composition(item.trackId).summary }; } catch { return item; }
    });
    const items = retrieveKnowledge(knowledge, [input.prompt, input.settings.genre, input.settings.mood].filter(Boolean).join(' '), provider === 'cli');
    this.database.client.transaction(() => {
      for (const [ordinal, item] of items.entries()) this.database.client.prepare('INSERT INTO generation_knowledge VALUES(?,?,?,?,?)').run(id, ordinal, item.reference.id, item.reference.digest, item.reference.rating);
    })();
    return items;
  }
  storeScore(id: string, index: number, score: Composition): void {
    this.database.client.prepare('INSERT INTO generation_scores VALUES(?,?,?)').run(id, index, JSON.stringify(score));
  }
  composition(trackId: string): { score: Composition; summary: string } {
    const row = this.database.client.prepare('SELECT s.score_json FROM tracks t JOIN generation_scores s ON s.generation_id=t.generation_id AND s.variation_index=t.variation_index WHERE t.id=?').get(trackId) as { score_json: string } | undefined;
    if (!row) throw new AppError(404, 'SCORE_UNAVAILABLE', '이 음원의 저장된 작곡 악보가 없습니다. 새 작곡부터 악보를 보존합니다.');
    const score = JSON.parse(row.score_json) as Composition;
    return { score, summary: `${score.bpm} BPM; ${score.genre}; ${score.mood}; sections: ${score.sections.map(s => s.name + ':' + s.bars).join(', ')}; instruments: ${[...new Set(score.parts.map(p => p.instrument))].join(', ')}; ${score.patterns.length} patterns` };
  }
  midi(trackId: string): Buffer {
    const artifact = this.composition(trackId);
    const row = this.database.client.prepare('SELECT t.duration_seconds FROM tracks t WHERE t.id=?').get(trackId) as { duration_seconds: number };
    return compositionMidi(artifact.score, row.duration_seconds);
  }
  references(id: string): KnowledgeReference[] {
    const rows = this.database.client.prepare('SELECT k.id,k.title,k.source,r.digest,r.rating FROM generation_knowledge r LEFT JOIN composition_knowledge k ON k.id=r.knowledge_id WHERE r.generation_id=? ORDER BY r.ordinal').all(id) as KnowledgeReference[];
    return rows.map(row => ({ ...row, title: row.title ?? '삭제된 지식', source: row.source ?? '삭제됨' }));
  }
}
