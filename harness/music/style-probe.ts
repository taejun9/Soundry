import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {CliProvider} from '../../backend/src/providers/cli-provider.js';
import {LlamaCppRunner} from '../../backend/src/providers/llamacpp-runner.js';
import {compositionMidi} from '../../backend/src/providers/composition/midi.js';
import {evaluateComposition} from './score-quality.js';
import type {Composition} from '../../backend/src/providers/composition/schema.js';
const root=resolve(process.argv[2]??'data/plan023-style-probe-01');await mkdir(root,{recursive:false});
const report=JSON.parse(await readFile('data/plan023-cli-quality-benchmark/benchmark.json','utf8'));const entry=report.tracks[0];
const reference=JSON.parse(await readFile('data/plan023-cli-quality-benchmark/artifacts/01/composition.json','utf8')) as Composition;
const original=JSON.stringify(reference);const input=entry.input;let score:Composition|undefined;
const nativeFetch=globalThis.fetch;let calls=0;
globalThis.fetch=async(...args:Parameters<typeof fetch>)=>{const response=await nativeFetch(...args);if(String(args[0]).endsWith('/v1/chat/completions')){calls++;const raw=await response.clone().text();await writeFile(join(root,`response-${calls}.json`),raw,{mode:0o600});const v=JSON.parse(raw);console.log(`Actual local response ${calls} finish=${v.choices?.[0]?.finish_reason} completionTokens=${v.usage?.completion_tokens}`);}return response;};
try{
 const provider=new CliProvider(new LlamaCppRunner(),{id:'llamacpp'});const tracks=await provider.generate(input,{styleReference:{score:reference,durationSeconds:120},signal:new AbortController().signal,onStage:stage=>console.log(stage),onComposition:(_i,value)=>{score=value;}});
 const pieces=[];for await(const piece of tracks[0]!.audio)pieces.push(piece);const audio=Buffer.concat(pieces);await writeFile(join(root,'original.wav'),audio,{flag:'wx'});await writeFile(join(root,'composition.json'),JSON.stringify(score,null,2)+'\n',{flag:'wx'});await writeFile(join(root,'composition.mid'),compositionMidi(score!,120),{flag:'wx'});
 if(JSON.stringify(reference)!==original)throw new Error('Parent score mutated');let changed=0;for(const [i,p] of score!.patterns.entries())for(const [j,n] of p.notes.entries())if(n.pitch!==reference.patterns[i]!.notes[j]!.pitch)changed++;
 const evidence={provider:'llamacpp',model:tracks[0]!.model,parentProvider:'cli',parentGenerationId:entry.result.requestId,parentAudioSha256:entry.result.sha256,changedPitchNotes:changed,newArrangementWritten:false,newMelodicVariationGenerated:true,styleFieldsUnchanged:JSON.stringify(score!.sections)===JSON.stringify(reference.sections)&&JSON.stringify(score!.parts)===JSON.stringify(reference.parts),sha256:createHash('sha256').update(audio).digest('hex'),quality:evaluateComposition(score!,120),listeningPerformed:false};await writeFile(join(root,'quality.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({provider:evidence.provider,model:evidence.model,changedPitchNotes:changed,styleFieldsUnchanged:evidence.styleFieldsUnchanged,sha256:evidence.sha256}));
}finally{globalThis.fetch=nativeFetch;}
