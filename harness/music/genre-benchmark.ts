/** Explicit genuine local Gemma benchmark; never opens a network listener or calls a remote model. */
import 'reflect-metadata';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { LlamaCppRunner } from '../../backend/src/providers/llamacpp-runner.js';
import { createApplication } from '../../backend/src/app.js';
import { DatabaseService } from '../../backend/src/database/database.service.js';
import { MembersService } from '../../backend/src/members/members.service.js';
import { KnowledgeService } from '../../backend/src/knowledge/knowledge.service.js';
import { ProjectsService } from '../../backend/src/projects/projects.service.js';
import { GenerationsService } from '../../backend/src/generations/generations.service.js';
import { ProviderService } from '../../backend/src/providers/provider.service.js';
import { COMPOSITION_CORPUS, GENRE_GUIDANCE } from './composition-corpus.js';
import { GENRE_PRESETS } from '../../frontend/src/features/generation/genres.js';
import { evaluateComposition } from './score-quality.js';

const root = resolve(process.argv[2] ?? 'data/plan021-genre-benchmark');
if (!root.endsWith('/plan021-genre-benchmark') || process.argv.length > 3) throw new Error('Use the explicit dedicated plan021-genre-benchmark directory');
await mkdir(root, { recursive: true, mode: 0o700 });
const reportPath = join(root, 'benchmark.json');
const save = async (value: unknown) => { const temporary = reportPath + '.tmp'; await writeFile(temporary, JSON.stringify(value,null,2)+'\n',{mode:0o600}); const { rename } = await import('node:fs/promises'); await rename(temporary,reportPath); };
class RecordingRunner extends LlamaCppRunner {
  override async compose(prompt: string, schema: object, signal: AbortSignal): Promise<unknown> {
    const candidate = await super.compose(prompt,schema,signal);
    const folder = join(root,'raw-candidates'); await mkdir(folder,{recursive:true,mode:0o700});
    await writeFile(join(folder,randomUUID()+'.json'),JSON.stringify(candidate,null,2)+'\n',{mode:0o600});
    return candidate;
  }
}
const app = await createApplication({ dataDir: root, musicProvider: 'llamacpp', lanHost: undefined, cliRunnerOverride: new RecordingRunner() });
await app.init();
try {
  const db = app.get(DatabaseService); const members = app.get(MembersService); const knowledge = app.get(KnowledgeService); const projects = app.get(ProjectsService); const generations = app.get(GenerationsService); const providers = app.get(ProviderService);
  await providers.refreshConfiguration(); if (!providers.summary().configured) throw new Error('Local Gemma not ready');
  const memberRows = db.client.prepare('SELECT id FROM members').all() as {id:string}[];
  if (memberRows.length > 1) throw new Error('Dedicated benchmark must have one test member');
  const memberId = memberRows[0]?.id ?? (await members.register({ email: 'genre-benchmark@example.test', name: 'Genre QA', password: randomUUID() + randomUUID() })).member.id;
  const existing = new Set(knowledge.list(memberId).map(item => item.content)); for (const item of COMPOSITION_CORPUS) if (!existing.has(item.content)) knowledge.save(memberId,item);
  type Entry = { number:number; genre:string; title:string; concept:string; description:string; tags:string[]; bpmRequested:number; seed:number; input:{prompt:string;settings:{mode:'instrumental';genre:string;mood:string;bpm:number;durationSeconds:number;seed:string};variationCount:number}; projectId?:string; attempts:{requestKey:string;generationId?:string;status?:string;error?:string|null;elapsedSeconds?:number}[]; result?: Record<string,unknown> };
  let report: { provider:string; model:string|null; durationSeconds:number; tracks:Entry[] };
  try { report = JSON.parse(await readFile(reportPath,'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; report = { provider:'llamacpp',model:providers.summary().model,durationSeconds:120,tracks: GENRE_PRESETS.map((preset,index) => ({ number:index+1,genre:preset.label,title:`Soundry ${String(index+1).padStart(2,'0')} ${preset.id}`,concept:preset.concept,description:`Original ${preset.label} instrumental composition by local Gemma with Soundry synthesis. No vocals.`,tags:[preset.label,'instrumental','Soundry','AI composition'],bpmRequested:GENRE_GUIDANCE[index]!.bpm,seed:21000+index,input:{prompt:preset.prompt + ' Compose an original coherent tonal theme and a distinct answer, independent low bass and upper chord pattern. Keep all transposed voices harmonically consistent. Use at least four melodic pattern IDs across the arrangement. Give the outro a purposeful stable resolution. Respect the six-note-per-pattern limit and include notes with meaningful rests and varied durations. No vocals or unsupported sound effects.',settings:{mode:'instrumental',genre:preset.label,mood:'expressive',bpm:GENRE_GUIDANCE[index]!.bpm,durationSeconds:120,seed:String(21000+index)},variationCount:1},attempts:[]})) }; await save(report); }
  if (report.provider !== 'llamacpp' || report.model !== providers.summary().model || report.tracks.length !== 16) throw new Error('Checkpoint provider/model/scope mismatch');
  for (const entry of report.tracks) {
    if (entry.result) { console.log(`SKIP ${entry.number} ${entry.genre} completed`); continue; }
    entry.projectId ??= projects.create(`Genre QA ${entry.number}: ${entry.genre}`,memberId).id; await save(report);
    // At most three explicit recorded attempts; failed jobs remain visible. No provider fallback.
    while (entry.attempts.length < 3 || ['queued','processing',undefined].includes(entry.attempts.at(-1)?.status)) {
      let attempt = entry.attempts.at(-1);
      if (!attempt || !['queued','processing',undefined].includes(attempt.status)) { attempt = {requestKey:randomUUID()}; entry.attempts.push(attempt); await save(report); }
      const started = Date.now();
      const accepted = generations.create(entry.projectId, {...entry.input,requestKey:attempt.requestKey},memberId).generation;
      attempt.generationId = accepted.id; attempt.status=accepted.status; await save(report); console.log(`START ${entry.number}/16 ${entry.genre} attempt ${entry.attempts.length}`);
      let generation = accepted;
      while (generation.status === 'queued' || generation.status === 'processing') { await delay(2000); generation=generations.get(accepted.id); }
      attempt.status=generation.status; attempt.error=generation.errorCode ?? null; attempt.elapsedSeconds=Math.round((Date.now()-started)/1000); await save(report);
      if (generation.status !== 'completed') { console.log(`FAIL ${entry.number} ${entry.genre} ${attempt.error} ${attempt.elapsedSeconds}s`); continue; }
      const track=generation.tracks[0]; if (!track || track.provider !== 'llamacpp' || track.model !== report.model) throw new Error('Actual track provenance mismatch');
      const artifacts=join(root,'artifacts',String(entry.number).padStart(2,'0')); await mkdir(artifacts,{recursive:true});
      const artifact=knowledge.composition(track.id); await writeFile(join(artifacts,'composition.json'),JSON.stringify(artifact.score,null,2)+'\n'); await writeFile(join(artifacts,'composition.mid'),knowledge.midi(track.id));
      const audioRow=db.client.prepare('SELECT audio_path FROM tracks WHERE id=?').get(track.id) as {audio_path:string};
      const { copyFile }=await import('node:fs/promises'); const source=join(root,audioRow.audio_path); const localFile=join(artifacts,'original.wav'); await copyFile(source,localFile); const bytes=await readFile(localFile);
      const references=knowledge.references(generation.id); const quality=evaluateComposition(artifact.score,120);
      entry.result={requestId:generation.id,trackId:track.id,provider:track.provider,model:track.model,seedReturned:track.seed,generatedAt:track.createdAt,localFile,sha256:createHash('sha256').update(bytes).digest('hex'),references,quality,listeningQa:{performed:false}};
      await save(report); console.log(`DONE ${entry.number}/16 ${entry.genre} ${attempt.elapsedSeconds}s patterns=${quality.patternCount} authored=${quality.authoredMelodicNotes}`); break;
    }
  }
  console.log(`BENCHMARK completed=${report.tracks.filter(entry=>entry.result).length}/16`);
} finally { await app.close(); }
