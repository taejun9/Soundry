import type {GenerationInput} from '../../../../shared/contracts.js';
import {AppError} from '../../api-errors.js';
import {ProviderError} from '../provider-error.js';
import {throwIfCancelled} from '../cli-runner.js';
import {parseComposition,expandComposition} from './schema.js';
import type {Composition} from './schema.js';
import type {ChatComposer} from './sectional-composer.js';
export interface StyleReference {score:Composition;durationSeconds:number}
export function validateReferenceInput(input:GenerationInput,reference:StyleReference):void {
 if((input.settings.bpm??reference.score.bpm)!==reference.score.bpm||(input.settings.durationSeconds??reference.durationSeconds)!==reference.durationSeconds||(input.settings.genre??reference.score.genre)!==reference.score.genre)
  throw new AppError(400,'STYLE_SETTINGS_MISMATCH','원본 스타일 변주는 원본의 장르·BPM·길이를 유지합니다. 독립 작곡은 새 프리셋을 선택해 주세요.');
}
export function referenceCompositionSchema(input:GenerationInput,reference:StyleReference):object {
 validateReferenceInput(input,reference);
 return {'x-soundry-quality':{version:3,reference:structuredClone(reference)},properties:{bpm:{enum:[reference.score.bpm]},genre:{enum:[reference.score.genre]},mood:{enum:[input.settings.mood??reference.score.mood]},seed:{enum:[input.settings.seed??reference.score.seed]}}};
}
function invalid():never{throw new ProviderError('LOCAL_INVALID_OUTPUT');}
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
/** Consonant pitch vocabulary inferred from the user's own selected score, not a perceptual rating. */
function scaleFor(score:Composition,duration:number):Set<number>{
 const events=expandComposition(score,duration).filter(e=>e.instrument!=='drums');let best:number[]=[];let coverage=-1;
 for(let root=0;root<12;root++)for(const intervals of [[0,2,4,5,7,9,11],[0,2,3,5,7,8,10]]){
  const pcs=intervals.map(i=>(root+i)%12);const fit=events.filter(e=>pcs.includes(e.pitch%12)).reduce((sum,e)=>sum+e.gate,0);if(fit>coverage){coverage=fit;best=pcs;}
 }
 return new Set(best);
}
export function referenceMelodySlots(score:Composition){
 const protectedPatterns=new Set(score.parts.filter(p=>['bass','drums','pad','organ'].includes(p.instrument)).map(p=>p.patternId));
 const eligible=new Set(score.parts.filter(p=>!['bass','drums','pad','organ'].includes(p.instrument)).map(p=>p.patternId));
 return score.patterns.flatMap(pattern=>{
  if(!eligible.has(pattern.id)||protectedPatterns.has(pattern.id))return [];
  const groups=new Map<number,number[]>();pattern.notes.forEach((note,index)=>{const group=groups.get(note.beat)??[];group.push(index);groups.set(note.beat,group);});
  const indices=[...groups.values()].filter(g=>g.length===1).flat();
  return indices.length>=3?[{id:pattern.id,indices}]:[];
 });
}
/** Only selected single-note pitch slots are recomposed. Reference rhythm, voicings and all arrangement/mix fields remain intact. */
export async function composeReference(prompt:string,schema:Record<string,unknown>,chat:ChatComposer,signal:AbortSignal):Promise<Composition>{
 const config=schema['x-soundry-quality'] as {reference:StyleReference};const reference=config.reference;const original=reference.score;
 const sourceInput:GenerationInput={prompt:'Selected owned score',settings:{mode:'instrumental',bpm:original.bpm,genre:original.genre,mood:original.mood,seed:original.seed,durationSeconds:reference.durationSeconds},variationCount:1};
 const source=parseComposition(original,sourceInput);const slots=referenceMelodySlots(source);if(!slots.length||slots.reduce((sum,s)=>sum+s.indices.length,0)>512)invalid();
 const mutable=new Map(slots.map(slot=>[slot.id,new Set(slot.indices)]));
 const fixed:{start:number;end:number;pitch:number}[]=[];
 for(const part of source.parts){if(part.instrument==='drums')continue;const pattern=source.patterns.find(p=>p.id===part.patternId)!;for(let r=0;r<part.repeats;r++)for(const [i,n]of pattern.notes.entries())if(!mutable.get(pattern.id)?.has(i)){const start=(part.startBar+r*pattern.bars)*4+n.beat;fixed.push({start,end:start+n.duration,pitch:n.pitch+part.transpose});}}
 const harmony=new Map<string,number[][]>();
 for(const slot of slots){const pattern=source.patterns.find(p=>p.id===slot.id)!;harmony.set(slot.id,slot.indices.map(i=>{const pcs=new Set<number>();for(const part of source.parts.filter(p=>p.patternId===slot.id))for(let r=0;r<part.repeats;r++){const onset=(part.startBar+r*pattern.bars)*4+pattern.notes[i]!.beat;for(const note of fixed)if(note.start<=onset&&note.end>onset)pcs.add(((note.pitch-part.transpose)%12+12)%12);}return [...pcs].sort((a,b)=>a-b);}));}
 const key=scaleFor(source,reference.durationSeconds);const choices=new Map<string,number[][]>();const properties:Record<string,unknown>={};
 for(const slot of slots){
  const pattern=source.patterns.find(p=>p.id===slot.id)!;const notes=slot.indices.map(index=>pattern.notes[index]!);const lo=Math.max(24,Math.min(...notes.map(n=>n.pitch))-2),hi=Math.min(96,Math.max(...notes.map(n=>n.pitch))+2);
  const required=Math.ceil(notes.length/3);const changePositions=new Set(Array.from({length:required},(_,i)=>Math.floor(i*(notes.length-1)/required)));
  const vocabulary=notes.map((note,index)=>{if(index===notes.length-1)return [note.pitch];const sounding=harmony.get(slot.id)![index]!;const range=Array.from({length:hi-lo+1},(_,i)=>lo+i).filter(p=>(key.has(p%12)||sounding.includes(p%12))&&Math.abs(p-note.pitch)<=5&&(!changePositions.has(index)||p!==note.pitch));if(!range.length)invalid();return range;});
  choices.set(slot.id,vocabulary);properties[slot.id]={type:'array',prefixItems:vocabulary.map(pitches=>({type:'integer',enum:pitches})),minItems:notes.length,maxItems:notes.length};
 }
 const outputSchema={type:'object',additionalProperties:false,properties:{pitchesByPattern:{type:'object',additionalProperties:false,properties,required:Object.keys(properties)}},required:['pitchesByPattern']};
 const context=slots.map(slot=>{const pattern=source.patterns.find(p=>p.id===slot.id)!;return {patternId:slot.id,bars:pattern.bars,instruments:[...new Set(source.parts.filter(p=>p.patternId===slot.id).map(p=>p.instrument))],slots:slot.indices.map(i=>{const n=pattern.notes[i]!;return {beat:n.beat,gate:n.duration,sourcePitch:n.pitch,velocity:n.velocity,soundingPitchClasses:harmony.get(slot.id)![slot.indices.indexOf(i)]};})};});
 const instruction='\nREFERENCE STYLE VARIATION: The user selected their own completed reference. Keep its groove, orchestration, register, dynamics and form. The application retains its exact note timing/gates/velocity, simultaneous chord groups, bass, drums, pad and organ accompaniment. Write only the NEW melodic pitches for the listed single-note slots, in order, as pitchesByPattern arrays. At least one third of pitches in every listed pattern must differ from its source; the grammar requires this. Preserve recognizable phrase contour with a developed answer and a purposeful cadence. Choose consonant pitches from the supplied vocabulary and smooth small movements rather than an ascending exercise. This is a new melodic variation of the selected score, not a newly written arrangement. Never invent extra notes, beats, instruments, fields, text or tools.\nReference sections/instruments:\n'+JSON.stringify({sections:source.sections,instruments:[...new Set(source.parts.map(p=>p.instrument))],keyPitchClasses:[...key]})+'\nMelodic slots with sounding accompaniment pitch classes:\n'+JSON.stringify(context);
 throwIfCancelled(signal);const draft:unknown=await chat(prompt+instruction+'\nMELODY DRAFT: Develop a singable motif and an answering phrase. Use the actual sounding accompaniment for strong beat tones; passing tones resolve by small movement. The final pitch is a retained cadence anchor.',outputSchema,signal);
 let issue='';for(let attempt=0;attempt<2;attempt++){
  throwIfCancelled(signal);const raw=await chat(prompt+instruction+'\nMELODY POLISH: Refine the draft below. Keep a recognizable hook, balance repetition with an answering phrase, avoid arbitrary zigzags and long runs of identical pitches, favor stepwise connections and chord tones on strong beats, and resolve passing tones. Preserve the retained final cadence pitch. Reconsider every proposed pitch against the actual accompaniment. Return the final arrays only.\nDraft pitches:\n'+JSON.stringify(draft)+(attempt?'\nRepair the invalid pitch arrays: '+issue:''),outputSchema,signal);
  try{
   if(!record(raw)||Object.keys(raw).length!==1||!record(raw.pitchesByPattern)||Object.keys(raw.pitchesByPattern).length!==slots.length)invalid();
   const next=structuredClone(source);let changed=0;
   for(const slot of slots){const values=raw.pitchesByPattern[slot.id];const vocabulary=choices.get(slot.id)!;if(!Array.isArray(values)||values.length!==slot.indices.length)invalid();const pattern=next.patterns.find(p=>p.id===slot.id)!;let changes=0;
    values.forEach((pitch,index)=>{if(!Number.isInteger(pitch)||!vocabulary[index]!.includes(pitch))invalid();const note=pattern.notes[slot.indices[index]!]!;if(note.pitch!==pitch){changes++;changed++;}note.pitch=pitch;});if(changes<Math.ceil(values.length/3))invalid();
   }
   const metadata=schema.properties as Record<string,{enum:unknown[]}>;next.bpm=metadata.bpm!.enum[0] as number;next.genre=metadata.genre!.enum[0] as string;next.mood=metadata.mood!.enum[0] as string;next.seed=metadata.seed!.enum[0] as string;
   if(!changed)invalid();return parseComposition(next,{...sourceInput,settings:{...sourceInput.settings,bpm:next.bpm,genre:next.genre,mood:next.mood,seed:next.seed}});
  }catch(error){if(!(error instanceof ProviderError))throw error;issue='Return every listed pattern with its exact pitch count and permitted numeric choices; change at least one third of its source pitches.';}
 }
 invalid();
}
