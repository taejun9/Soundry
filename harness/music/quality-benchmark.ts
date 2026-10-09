/** Explicit new local genre compositions with checkpointed attempts and exact provider provenance. */
import 'reflect-metadata';
import { randomUUID,createHash } from 'node:crypto';
import { mkdir,readFile,writeFile,rename,copyFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../../backend/src/app.js';
import { MembersService } from '../../backend/src/members/members.service.js';
import { ProjectsService } from '../../backend/src/projects/projects.service.js';
import { GenerationsService } from '../../backend/src/generations/generations.service.js';
import { KnowledgeService } from '../../backend/src/knowledge/knowledge.service.js';
import { DatabaseService } from '../../backend/src/database/database.service.js';
import { ProviderService } from '../../backend/src/providers/provider.service.js';
import { COMPOSITION_CORPUS,GENRE_GUIDANCE } from './composition-corpus.js';
import { GENRE_PRESETS } from '../../frontend/src/features/generation/genres.js';
import { evaluateComposition } from './score-quality.js';
import type { GenerationInput } from '../../shared/contracts.js';
const root=resolve(process.argv[2]??'data/plan023-quality-benchmark');
const mode=process.argv[4]??'independent';if(!['independent','reference'].includes(mode))throw new Error('Explicit composition mode required');
const providerId=process.argv[3]??'llamacpp';if(!['cli','llamacpp'].includes(providerId)||!root.endsWith(mode==='reference'?'/plan023-style-matched':providerId==='cli'?'/plan023-cli-quality-benchmark':'/plan023-quality-benchmark'))throw new Error('Dedicated provider-specific quality data only');
await mkdir(root,{recursive:true});const path=join(root,'benchmark.json');
const parentReport=mode==='reference'?JSON.parse(await readFile(join(root,'parent-benchmark.json'),'utf8')):undefined;
if(parentReport&&(providerId!=='llamacpp'||parentReport.provider!=='cli'||parentReport.tracks.length!==16||parentReport.tracks.some((t:{result?:unknown})=>!t.result)))throw new Error('Actual completed CLI parents required');
let phaseCount=0;const nativeFetch=globalThis.fetch;
globalThis.fetch=async (...args:Parameters<typeof fetch>)=>{const response=await nativeFetch(...args);if(String(args[0]).endsWith('/v1/chat/completions')){const raw=await response.clone().text();phaseCount++;const body=JSON.parse(String(args[1]?.body??'{}'));const prompt=String(body.messages?.[0]?.content??'');const descriptor=prompt.match(/SECTION [0-9]+\/[0-9]+ [a-z]+/)?.[0]??(mode==='reference'?'reference-melody':'harmonic-plan');const issue=prompt.match(/EXACT VALIDATION FAILURE: ([^\n]+)/)?.[1]??null;const value=JSON.parse(raw);value.soundryDiagnostic={descriptor,repairIssue:issue};await mkdir(join(root,'responses'),{recursive:true});await writeFile(join(root,'responses',`${Date.now()}-${phaseCount}.json`),JSON.stringify(value),{mode:0o600});console.log(`MODEL ${descriptor} repair=${issue!==null} finish=${value.choices?.[0]?.finish_reason??'error'} completionTokens=${value.usage?.completion_tokens??0}`);}return response;};
const app=await createApplication({dataDir:root,musicProvider:providerId});await app.init();
const save=async(value:unknown)=>{await writeFile(path+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(path+'.tmp',path);};
type Entry={number:number;genre:string;title:string;concept:string;description:string;tags:string[];bpmRequested:number;seed:number;input:GenerationInput;projectId?:string;sourceGenerationId?:string;parent?:Record<string,unknown>;attempts:{requestKey:string;generationId?:string;status?:string;error?:string|null;elapsedSeconds?:number}[];result?:Record<string,unknown>};
try {
 const providers=app.get(ProviderService);await providers.refreshConfiguration();if(!providers.summary().configured)throw new Error('Local model unavailable');
 const db=app.get(DatabaseService),knowledge=app.get(KnowledgeService),members=app.get(MembersService),projects=app.get(ProjectsService),generations=app.get(GenerationsService);
 const rows=db.client.prepare('SELECT id FROM members').all() as {id:string}[];if(rows.length>1)throw new Error('Dedicated QA owner only');
 const memberId=rows[0]?.id??(await members.register({name:'Quality benchmark',email:'quality-benchmark@example.test',password:randomUUID()+randomUUID()})).member.id;
 const known=new Set(knowledge.list(memberId).map(row=>row.content));for(const item of COMPOSITION_CORPUS)if(!known.has(item.content))knowledge.save(memberId,{...item,allowRemote:providerId==='cli'});
 const expectedModel=mode==='reference'?providers.summary().model?.replace(/:sectional-v2$/,':reference-v3'):providers.summary().model;
 let report:{provider:string;model:string|null|undefined;durationSeconds:number;method?:string;tracks:Entry[]};
 try {report=JSON.parse(await readFile(path,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
 report={provider:providerId,model:expectedModel,method:mode==='reference'?'reference-preserving melodic variations of original Codex parents':'independent sectional compositions',durationSeconds:120,tracks:GENRE_PRESETS.map((preset,index)=>({number:index+1,genre:preset.label,title:`Soundry Quality ${index+1}: ${preset.concept}`,concept:preset.concept,description:`Original ${preset.label} instrumental, newly composed for a Gemma/Codex quality benchmark with Soundry synthesis. Developed melody and polyphonic harmony; no vocals.`,tags:[preset.label,'instrumental','Soundry','original composition'],bpmRequested:GENRE_GUIDANCE[index]!.bpm,seed:23000+index,input:{prompt:preset.prompt+' Write a complete original piece with coherent chord changes, a recognizable motif, developed answering phrases, a contrasting bridge, a varied climactic return, and a purposeful tonic cadence. Preserve genre-specific rhythm and instrumental roles. Use real simultaneous chord voicings, low independent bass and expressive rests/gates. No vocals, no imitation of an existing tune.',settings:{mode:'instrumental',genre:preset.label,mood:'expressive',bpm:GENRE_GUIDANCE[index]!.bpm,durationSeconds:120,seed:String(23000+index)},variationCount:1},attempts:[]}))};if(parentReport)for(const [index,entry]of report.tracks.entries()){const parent=parentReport.tracks[index];entry.projectId=parent.projectId;entry.sourceGenerationId=parent.result.requestId;entry.parent={provider:parent.result.provider,model:parent.result.model,generationId:parent.result.requestId,trackId:parent.result.trackId,sourceAudioSha256:parent.result.sha256};}await save(report);}
 if(report.provider!==providerId||report.model!==expectedModel)throw new Error('Checkpoint model mismatch');
 for(const entry of report.tracks){
  if(entry.result){const result=entry.result as {localFile:string;sha256:string};if(createHash('sha256').update(await readFile(result.localFile)).digest('hex')!==result.sha256)throw new Error('Checkpoint source hash mismatch');console.log(`SKIP ${entry.number} verified source`);continue;}
  entry.projectId??=projects.create(`New quality ${entry.number}: ${entry.genre}`,memberId).id;await save(report);
  while(entry.attempts.length<3||['queued','processing',undefined].includes(entry.attempts.at(-1)?.status)){
   let attempt=entry.attempts.at(-1);if(!attempt||!['queued','processing',undefined].includes(attempt.status)){attempt={requestKey:randomUUID()};entry.attempts.push(attempt);await save(report);}
   const started=Date.now(),accepted=generations.create(entry.projectId,{...entry.input,requestKey:attempt.requestKey,...(entry.sourceGenerationId?{sourceGenerationId:entry.sourceGenerationId}:{})},memberId).generation;attempt.generationId=accepted.id;attempt.status=accepted.status;await save(report);
   console.log(`START ${entry.number}/16 ${entry.genre} attempt=${entry.attempts.length}`);let job=accepted;
   while(['queued','processing'].includes(job.status)){await delay(2000);job=generations.get(accepted.id);}
   attempt.status=job.status;attempt.error=job.errorCode??null;attempt.elapsedSeconds=Math.round((Date.now()-started)/1000);await save(report);
   if(job.status!=='completed'){console.log(`FAIL ${entry.number} ${entry.genre} ${attempt.error}`);if(attempt.error==='CLI_LIMIT_REACHED'||attempt.error==='CLI_LOGIN_REQUIRED')throw new Error('CLI account needs attention; checkpoint preserved');continue;}
   const track=job.tracks[0]!;if(track.provider!==providerId||track.model!==report.model)throw new Error('Provider mismatch');
   const artifacts=join(root,'artifacts',String(entry.number).padStart(2,'0'));await mkdir(artifacts,{recursive:true});
   const artifact=knowledge.composition(track.id);await writeFile(join(artifacts,'composition.json'),JSON.stringify(artifact.score,null,2)+'\n');await writeFile(join(artifacts,'composition.mid'),knowledge.midi(track.id));
   const row=db.client.prepare('SELECT audio_path FROM tracks WHERE id=?').get(track.id) as {audio_path:string};const localFile=join(artifacts,'original.wav');await copyFile(join(root,row.audio_path),localFile);
   const quality=evaluateComposition(artifact.score,120);
   let styleEvidence:Record<string,unknown>|undefined;
   if(parentReport){const parent=JSON.parse(await readFile(join(root,'parent-artifacts',String(entry.number).padStart(2,'0'),'composition.json'),'utf8'));if(JSON.stringify(parent.sections)!==JSON.stringify(artifact.score.sections)||JSON.stringify(parent.parts)!==JSON.stringify(artifact.score.parts))throw new Error('Style arrangement changed');let changed=0;
    for(const [i,p]of artifact.score.patterns.entries()){const original=parent.patterns[i];if(p.id!==original.id||p.bars!==original.bars||p.notes.length!==original.notes.length)throw new Error('Style pattern changed');for(const [j,n]of p.notes.entries()){const old=original.notes[j];if(n.beat!==old.beat||n.duration!==old.duration||n.velocity!==old.velocity)throw new Error('Style note timing/dynamics changed');if(n.pitch!==old.pitch)changed++;}}
    if(!changed)throw new Error('No new melodic variation');styleEvidence={newArrangementWritten:false,newMelodicVariationGenerated:true,changedPitchNotes:changed,sourceScoreSha256:createHash('sha256').update(await readFile(join(root,'parent-artifacts',String(entry.number).padStart(2,'0'),'composition.json'))).digest('hex'),arrangementRhythmGatesDynamicsMixPreserved:true};
   }
   entry.result={requestId:job.id,trackId:track.id,provider:track.provider,model:track.model,seedReturned:track.seed,generatedAt:track.createdAt,localFile,sha256:createHash('sha256').update(await readFile(localFile)).digest('hex'),references:knowledge.references(job.id),quality,...(styleEvidence?{styleEvidence}:{}),listeningQa:{performed:false}};await save(report);
   console.log(`DONE ${entry.number}/16 ${entry.genre} authored=${quality.authoredMelodicNotes} patterns=${quality.patternCount} elapsed=${attempt.elapsedSeconds}s`);break;
  }
 }
 const completed=report.tracks.filter(t=>t.result).length;console.log(`FINISHED ${completed}/16`);if(completed!==16)throw new Error('Incomplete benchmark: failed attempts retained, no complete package permitted');
}finally{globalThis.fetch=nativeFetch;await app.close();}
