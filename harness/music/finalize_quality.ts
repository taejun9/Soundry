/** Independent final score/source revalidation and paired structural comparison; no quality rating. */
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve,join,dirname } from 'node:path';
import { expandComposition, parseComposition } from '../../backend/src/providers/composition/schema.js';
import { percussionExcluded,percussionRequested,quarterKickRequested } from '../../backend/src/providers/composition/llamacpp-schema.js';
import { referenceMelodySlots } from '../../backend/src/providers/composition/reference-composer.js';
import { grooveProfile } from '../../backend/src/providers/composition/sectional-composer.js';
import { evaluateComposition } from './score-quality.js';
import { GENRE_PRESETS } from '../../frontend/src/features/generation/genres.js';
import type { GenerationInput } from '../../shared/contracts.js';
type Entry={number:number;genre:string;input:GenerationInput;parent?:{sourceAudioSha256:string};result?:{localFile:string;sha256:string;quality:ReturnType<typeof evaluateComposition>;styleEvidence?:{changedPitchNotes:number;sourceScoreSha256:string;newArrangementWritten:boolean};references:{digest:string}[]}};
const paths=process.argv.slice(2).map(value=>resolve(value));if(paths.length<1||paths.length>2)throw new Error('One or two actual benchmark files required');
const reports:{provider:string;model:string;method?:string;tracks:Entry[]}[]=[];
for(const path of paths){
 const report=JSON.parse(await readFile(path,'utf8')) as {provider:string;model:string;method?:string;tracks:Entry[]};
 if(!['cli','llamacpp'].includes(report.provider)||report.tracks.length!==16||report.tracks.some(t=>!t.result)||report.tracks.some((t,i)=>t.genre!==GENRE_PRESETS[i]!.label))throw new Error('Incomplete or mismatched actual benchmark');
 for(const entry of report.tracks){
  const result=entry.result!;const score=parseComposition(JSON.parse(await readFile(join(dirname(path),'artifacts',String(entry.number).padStart(2,'0'),'composition.json'),'utf8')),entry.input);
  if(createHash('sha256').update(await readFile(result.localFile)).digest('hex')!==result.sha256)throw new Error('Actual source hash mismatch');
  const events=expandComposition(score,120);const drums=events.filter(e=>e.instrument==='drums');
  if(percussionExcluded(entry.input)&&drums.length)throw new Error('Excluded percussion present');
  if(percussionRequested(entry.input)&&!score.sections.filter(s=>s.name==='chorus').every(s=>drums.some(e=>e.start>=s.startBar*240/score.bpm&&e.start<(s.startBar+s.bars)*240/score.bpm)))throw new Error('Requested chorus percussion missing');
  if(quarterKickRequested(entry.input))for(const section of score.sections.filter(s=>['verse','chorus'].includes(s.name)))for(let beat=section.startBar*4;beat<(section.startBar+section.bars)*4&&beat*60/score.bpm<120;beat++)if(!drums.some(e=>e.pitch===36&&Math.abs(e.start*score.bpm/60-beat)<0.00001))throw new Error('Requested main quarter kick missing');
  if(report.provider==='llamacpp'&&!report.method?.startsWith('reference-preserving')){
   const profile=grooveProfile(score.genre.toLowerCase(),entry.input.prompt);
   for(const section of score.sections.filter(s=>['verse','chorus','bridge'].includes(s.name))){
    const active=score.parts.filter(p=>p.startBar===section.startBar);const bass=active.filter(p=>p.instrument==='bass').flatMap(p=>score.patterns.find(x=>x.id===p.patternId)!.notes);
    if(['syncopated','offbeat'].includes(profile)&&!bass.some(n=>Math.abs(n.beat-Math.round(n.beat))>0.00001))throw new Error('Requested bass syncopation missing');
    if(profile==='offbeat'){const chords=score.patterns.find(p=>p.id.endsWith('_chords')&&active.some(a=>a.patternId===p.id));if(!chords||chords.notes.some(n=>Math.abs(n.beat%1-0.5)>0.00001||n.duration>0.5))throw new Error('Requested short offbeat chord missing');}
   }
  }
  if(report.method?.startsWith('reference-preserving')){
   const parent=parseComposition(JSON.parse(await readFile(join(dirname(path),'parent-artifacts',String(entry.number).padStart(2,'0'),'composition.json'),'utf8')),entry.input);
   if(JSON.stringify(score.parts)!==JSON.stringify(parent.parts)||JSON.stringify(score.sections)!==JSON.stringify(parent.sections)||score.patterns.length!==parent.patterns.length)throw new Error('Parent arrangement mismatch');
   const slots=referenceMelodySlots(parent);let changed=0;
   for(const [i,p]of score.patterns.entries()){const old=parent.patterns[i]!;const indices=slots.find(s=>s.id===p.id)?.indices??[];let patternChanges=0;if(p.id!==old.id||p.bars!==old.bars||p.notes.length!==old.notes.length)throw new Error('Parent pattern mismatch');
    for(const [j,n]of p.notes.entries()){const before=old.notes[j]!;if(JSON.stringify({...n,pitch:before.pitch})!==JSON.stringify(before)||(!indices.includes(j)&&n.pitch!==before.pitch))throw new Error('Accompaniment/rhythm/mix changed');if(n.pitch!==before.pitch){changed++;patternChanges++;}}
    if(indices.length&&patternChanges<Math.ceil(indices.length/3))throw new Error('Insufficient new melodic pitches');
    if(indices.length&&p.notes[indices.at(-1)!]!.pitch!==old.notes[indices.at(-1)!]!.pitch)throw new Error('Cadence anchor changed');
   }if(!changed)throw new Error('No new melodic pitches');
   const parentHash=createHash('sha256').update(await readFile(join(dirname(path),'parent-artifacts',String(entry.number).padStart(2,'0'),'composition.json'))).digest('hex');
   if(result.styleEvidence?.sourceScoreSha256!==parentHash||result.styleEvidence.changedPitchNotes!==changed||result.styleEvidence.newArrangementWritten!==false)throw new Error('Style provenance mismatch');
  }
  result.quality=evaluateComposition(score,120);
  if(result.references.length!==6||new Set(result.references.map(r=>r.digest)).size!==6)throw new Error('Distinct public guidance required');
 }
 await writeFile(path,JSON.stringify(report,null,2)+'\n',{mode:0o600});reports.push(report);
}
if(reports.length===2){
 const pairs=reports[0]!.tracks.map((left,index)=>{
  const right=reports[1]!.tracks[index]!;if(JSON.stringify(left.input)!==JSON.stringify(right.input))throw new Error('Paired brief/settings differ');
  if(JSON.stringify(left.result!.references.map(r=>r.digest).sort())!==JSON.stringify(right.result!.references.map(r=>r.digest).sort()))throw new Error('Paired public guidance differs');
  if(left.parent&&left.parent.sourceAudioSha256!==right.result!.sha256)throw new Error('Paired style parent source mismatch');
  const summary=(t:Entry)=>{const q=t.result!.quality;return {authoredMelodicNotes:q.authoredMelodicNotes,melodicPatterns:q.melodicPatternCount,maxPhraseBars:q.maxAuthoredPhraseBars,chordGroups:q.authoredPolyphonicChordGroups,chordShapes:q.distinctChordPitchClassShapes,durationKinds:q.authoredDurationKinds,tripletOnsets:q.authoredTripletOnsets,unchangedRepeatSeconds:q.longestPatternRepetitionSeconds,drumOnsets:q.drumOnsets,rhythmicRoles:q.rhythmicRoles,quarterKickCoverage:q.quarterKickTimelineCoverage};};
  return {genre:left.genre,[reports[0]!.provider]:summary(left),[reports[1]!.provider]:summary(right)};
 });
 await writeFile(join(dirname(paths[0]!),'paired-comparison.json'),JSON.stringify({method:'same public brief/BPM/duration/seed/guidance and renderer; Gemma variations additionally inherit the corresponding Codex arrangement and accompaniment; structural observations only',listeningPerformed:false,qualityParity:'unassessed',pairs},null,2)+'\n');
}
console.log('Actual canonical scores, distinct guidance and source hashes verified.');
