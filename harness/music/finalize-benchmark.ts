/** Revalidates actual scores and WAV hashes before computing a consistent final structural report. */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { parseComposition } from '../../backend/src/providers/composition/schema.js';
import { percussionRequested, percussionExcluded, quarterKickRequested } from '../../backend/src/providers/composition/llamacpp-schema.js';
import { evaluateComposition } from './score-quality.js';
import type { GenerationInput } from '../../shared/contracts.js';
const path = resolve(process.argv[2] ?? 'data/plan021-genre-benchmark/benchmark.json');
const report=JSON.parse(await readFile(path,'utf8')) as {provider:string;tracks:{number:number;input:GenerationInput;result?:{localFile:string;sha256:string;quality:ReturnType<typeof evaluateComposition>}}[]};
if (report.provider!=='llamacpp'||report.tracks.length!==16||report.tracks.some(track=>!track.result)) throw new Error('Complete all 16 tracks first');
for (const track of report.tracks) {
  const result=track.result!;
  const raw=JSON.parse(await readFile(join(dirname(path),'artifacts',String(track.number).padStart(2,'0'),'composition.json'),'utf8')) as unknown;
  const score=parseComposition(raw,track.input);
  if (createHash('sha256').update(await readFile(result.localFile)).digest('hex')!==result.sha256) throw new Error('Original hash mismatch');
  const chorus=score.sections.find(section=>section.name==='chorus')!;
  if (percussionRequested(track.input) && !score.parts.some(part=>part.instrument==='drums'&&part.startBar===chorus.startBar)) throw new Error('Requested chorus percussion missing');
  if (percussionExcluded(track.input) && score.parts.some(part=>part.instrument==='drums')) throw new Error('Excluded percussion present');
  if (quarterKickRequested(track.input)) {
    const pattern=score.patterns.find(pattern=>pattern.id==='d1');
    if (!pattern||pattern.bars!==1||pattern.notes.length!==4||new Set(pattern.notes.map(note=>note.beat)).size!==4||pattern.notes.some(note=>note.pitch!==36||![0,1,2,3].includes(note.beat))) throw new Error('Requested quarter kicks missing');
    for (const section of score.sections.filter(section=>['verse','chorus'].includes(section.name))) if (!score.parts.some(part=>part.instrument==='drums'&&part.patternId==='d1'&&part.startBar===section.startBar)) throw new Error('Requested verse/chorus groove missing');
  }
  result.quality=evaluateComposition(score,track.input.settings.durationSeconds!);
}
await writeFile(path+'.final.tmp',JSON.stringify(report,null,2)+'\n',{mode:0o600});await rename(path+'.final.tmp',path);
console.log('All 16 original hashes and canonical scores revalidated; structural observations refreshed.');
