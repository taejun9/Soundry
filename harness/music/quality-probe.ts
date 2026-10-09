/** Explicit local sectional quality probe; retains candidates in ignored data only. */
import { mkdir,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { LlamaCppRunner } from '../../backend/src/providers/llamacpp-runner.js';
import { CodexCliRunner } from '../../backend/src/providers/cli-runner.js';
import { CliProvider } from '../../backend/src/providers/cli-provider.js';
import { parseComposition } from '../../backend/src/providers/composition/index.js';
import { compositionMidi } from '../../backend/src/providers/composition/midi.js';
import type { Composition } from '../../backend/src/providers/composition/index.js';
import { evaluateComposition } from './score-quality.js';
const root=resolve(process.argv[2]??'data/plan023-probe');await mkdir(root,{recursive:true});
let count=0;
class CaptureRunner extends LlamaCppRunner {
  // request is private in production; wrap the local fetch boundary to retain finite responses without changing it.
}
const providerId=process.argv[3]??'llamacpp';if(!['cli','llamacpp'].includes(providerId))throw new Error('Explicit cli or llamacpp provider only');
const runner=providerId==='cli'?new CodexCliRunner():new CaptureRunner();const provider=new CliProvider(runner,{id:providerId});
const input={prompt:'Original instrumental jazz with warm piano seventh and ninth chords, independent low bass, expressive singable melody, swung drums, coherent harmonic movement, developed answering phrases, contrasting bridge, returning chorus and purposeful tonic ending.',settings:{mode:'instrumental' as const,genre:'Jazz',mood:'warm and expressive',bpm:116,durationSeconds:120,seed:'23001'},variationCount:1};
let score:Composition|undefined;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(...args:Parameters<typeof fetch>)=>{
  const response=await originalFetch(...args);
  if(String(args[0]).endsWith('/v1/chat/completions')) {
    const clone=response.clone();const raw=await clone.text();count++;
    await writeFile(join(root,`stage-${String(count).padStart(2,'0')}.json`),raw,{mode:0o600});
    const data=JSON.parse(raw);console.log(`Stage ${count} ${data.choices?.[0]?.finish_reason} prompt=${data.usage?.prompt_tokens} output=${data.usage?.completion_tokens}`);
  }
  return response;
};
try {
 const tracks=await provider.generate(input,{signal:new AbortController().signal,onStage:stage=>console.log(stage),onComposition:(_index,s)=>{score=s;}});
 const pieces=[];for await(const piece of tracks[0]!.audio)pieces.push(piece);
 await writeFile(join(root,'original.wav'),Buffer.concat(pieces));
 const canonical=parseComposition(score,input);await writeFile(join(root,'composition.json'),JSON.stringify(canonical,null,2)+'\n');await writeFile(join(root,'composition.mid'),compositionMidi(canonical,120));
 const quality=evaluateComposition(canonical,120);await writeFile(join(root,'quality.json'),JSON.stringify({provider:providerId,model:provider.model,...quality},null,2)+'\n');console.log(JSON.stringify(quality));
}finally{globalThis.fetch=originalFetch;}
