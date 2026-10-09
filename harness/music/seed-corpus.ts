/** Explicit local corpus import. Existing knowledge is preserved; content duplicates are skipped. */
import 'reflect-metadata';
import { join, resolve } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { DatabaseService } from '../../backend/src/database/database.service.js';
import { StorageConfig } from '../../backend/src/config/storage-config.js';
import { KnowledgeService } from '../../backend/src/knowledge/knowledge.service.js';
import { COMPOSITION_CORPUS, GENRE_GUIDANCE } from './composition-corpus.js';

const [dataDir, memberId, benchmarkPath] = process.argv.slice(2);
if (!dataDir || !memberId || !/^[a-f0-9-]{36}$/.test(memberId) || (process.argv.length !== 4 && process.argv.length !== 5)) throw new Error('Specify an explicit data directory and member UUID. Stop its API first.');
const root = resolve(dataDir);
const database = new DatabaseService(new StorageConfig(root));
try {
  if (!database.client.prepare('SELECT 1 FROM members WHERE id=?').get(memberId)) throw new Error('Member not found');
  await database.client.backup(join(root, `before-corpus-v1-${Date.now()}.sqlite`));
  const knowledge = new KnowledgeService(database); const existing = knowledge.list(memberId); const seen = new Set(existing.map(item => item.content));
  const corpus = [...COMPOSITION_CORPUS];
  if (benchmarkPath) {
    const report = JSON.parse(await readFile(benchmarkPath,'utf8')) as { provider:string; tracks:{genre:string;result?:{requestId:string;quality:{authoredMelodicNotes:number;melodicPatternCount:number;uniqueIntervalRhythmMotifs:number;drumOnsets:number;longestPatternRepetitionSeconds:number;observations:string[]}}}[] };
    if (report.provider !== 'llamacpp' || report.tracks.length !== 16 || report.tracks.some((track,index) => track.genre !== GENRE_GUIDANCE[index]!.genre || !track.result)) throw new Error('Completed 16-genre local benchmark required');
    for (const track of report.tracks) {
      const result = track.result!, q = result.quality;
      for (const value of [q.authoredMelodicNotes,q.melodicPatternCount,q.uniqueIntervalRhythmMotifs,q.drumOnsets,q.longestPatternRepetitionSeconds]) if (!Number.isFinite(value) || value < 0) throw new Error('Invalid structural observation');
      corpus.push({ title: `${track.genre}: 실제 Gemma 구조 검사`, tags:`${track.genre}|실제 구조 검사|Evaluation`,
        content: `Automated structural observations for ${track.genre} from a 120-second local Gemma composition; human listening and music quality are unassessed. Authored melodic notes: ${q.authoredMelodicNotes}; melodic patterns: ${q.melodicPatternCount}; unique interval/rhythm motifs: ${q.uniqueIntervalRhythmMotifs}; notated drum onsets: ${q.drumOnsets}; longest unchanged pattern repetition: ${q.longestPatternRepetitionSeconds.toFixed(1)} seconds. ${q.observations.join(' ')} Use these factual limitations to inspect future motif development, bass register and requested percussion; they are not approved examples or a subjective rating.`,
        source:`Soundry benchmark v1; generation ${result.requestId}`, rights:'own', allowRemote:false });
    }
  }
  const pending = corpus.filter(item => !seen.has(item.content));
  if (existing.length + pending.length > 500) throw new Error('Corpus exceeds member knowledge limit; no changes made');
  database.client.transaction(() => { for (const item of pending) knowledge.save(memberId, item); })();
  const after = knowledge.list(memberId);
  const audit = { before: existing.length, added: pending.length, after: after.length, distinctContents: new Set(after.map(item => item.content)).size, corpusVersion: 1, genreCount: 16, remoteAllowedAdded: 0, humanRatingsAdded: 0, structuralObservationsAdded: benchmarkPath ? pending.filter(item => item.title.endsWith("실제 Gemma 구조 검사")).length : 0 };
  await writeFile(join(root, 'corpus-v1-audit.json'), JSON.stringify(audit, null, 2) + '\n', { mode: 0o600 }); console.log(audit);
} finally { database.onApplicationShutdown(); }
