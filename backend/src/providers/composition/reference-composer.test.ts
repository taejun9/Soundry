import {describe,it,expect} from 'vitest';
import {composeReference,referenceCompositionSchema,referenceMelodySlots,validateReferenceInput} from './reference-composer.js';
import {parseComposition} from './schema.js';
import type {Composition,Note} from './schema.js';
const note=(beat:number,pitch:number,duration=0.4):Note=>({beat,pitch,duration,velocity:0.7});
function fixture():Composition{
 const lengths=[4,12,12,8,9];let start=0;const sections=(['intro','verse','chorus','bridge','outro'] as const).map((name,i)=>{const section={name,startBar:start,bars:lengths[i]!};start+=section.bars;return section;});
 const parts:Composition['parts']=[];for(const [i,s] of sections.entries()){const c={startBar:s.startBar,repeats:s.bars,transpose:0};parts.push({...c,instrument:'piano',patternId:'chords',gain:i===2?0.4:0.25,pan:-0.3},{...c,instrument:'bass',patternId:'bass',gain:0.55,pan:0});if(i!==0)parts.push({...c,instrument:i===3?'bell':'synth',patternId:i===2?'hook':'melody',gain:0.35,pan:0.18});if(i===1||i===2)parts.push({...c,instrument:'drums',patternId:'kit',gain:0.7,pan:0});}
 return {version:1,bpm:120,genre:'Jazz',mood:'warm',seed:'synthetic-style-fixture',sections,parts,patterns:[{id:'chords',bars:1,notes:[0,1,2,3].flatMap(b=>[60,64,67].map(p=>note(b,p,0.8)))},{id:'bass',bars:1,notes:[36,43,40,47].map((p,b)=>note(b,p,0.85))},{id:'melody',bars:1,notes:[72,74,76,79,76,74,71,67].map((p,i)=>note(i/2,p))},{id:'hook',bars:1,notes:[79,76,74,72,74,76,81,79].map((p,i)=>note(i/2,p))},{id:'kit',bars:1,notes:[note(0,36),note(1,38),note(2,36),note(3,38)]}]};
}
const input={prompt:'Original reference variation',settings:{mode:'instrumental' as const,genre:'Jazz',bpm:120,durationSeconds:90,seed:'new-variation'},variationCount:1};
type OutputSchema={properties:{pitchesByPattern:{properties:Record<string,{prefixItems:{enum:number[]}[]}>}}};
const reply=(schema:object)=>({pitchesByPattern:Object.fromEntries(Object.entries((schema as OutputSchema).properties.pitchesByPattern.properties).map(([id,array])=>[id,array.prefixItems.map(item=>item.enum[0]!)]))});
describe('owned reference style variation',()=>{
 it('recomposes melodic pitches while preserving source timing, harmony, orchestration and mix exactly',async()=>{
  const original=fixture(),before=JSON.stringify(original),reference={score:original,durationSeconds:90};parseComposition(original,{...input,settings:{...input.settings,seed:original.seed}});let calls=0;
  const next=await composeReference('private own reference',referenceCompositionSchema(input,reference) as Record<string,unknown>,async(p,s)=>{calls++;expect(p).toContain('soundingPitchClasses');expect(p).toContain(calls===1?'MELODY DRAFT':'MELODY POLISH');return reply(s);},new AbortController().signal);
  expect(calls).toBe(2);expect(JSON.stringify(original)).toBe(before);expect(next.sections).toEqual(original.sections);expect(next.parts).toEqual(original.parts);expect(next.seed).toBe('new-variation');for(const slot of referenceMelodySlots(original)){const a=original.patterns.find(p=>p.id===slot.id)!,b=next.patterns.find(p=>p.id===slot.id)!;expect(b.notes[slot.indices.at(-1)!]!.pitch).toBe(a.notes[slot.indices.at(-1)!]!.pitch);}
  const slots=referenceMelodySlots(original);expect(slots.map(s=>s.id)).toEqual(['melody','hook']);for(const [i,p] of next.patterns.entries()){const mutable=slots.find(s=>s.id===p.id);let changed=0;for(const [j,n] of p.notes.entries()){const old=original.patterns[i]!.notes[j]!;expect({...n,pitch:old.pitch}).toEqual(old);if(n.pitch!==old.pitch)changed++;}expect(changed).toBeGreaterThanOrEqual(mutable?Math.ceil(mutable.indices.length/3):0);if(!mutable)expect(p).toEqual(original.patterns[i]);}
 });
 it('rejects style metadata mismatches before inference and bounds a copied or invalid response to one repair',async()=>{
  const reference={score:fixture(),durationSeconds:90};for(const settings of [{bpm:100},{genre:'Rock'},{durationSeconds:120}])expect(()=>validateReferenceInput({...input,settings:{...input.settings,...settings}},reference)).toThrow();let calls=0;
  await expect(composeReference('reference',referenceCompositionSchema(input,reference) as Record<string,unknown>,async()=>{calls++;return {pitchesByPattern:{melody:reference.score.patterns[2]!.notes.map(n=>n.pitch),hook:reference.score.patterns[3]!.notes.map(n=>n.pitch)}};},new AbortController().signal)).rejects.toMatchObject({code:'LOCAL_INVALID_OUTPUT'});expect(calls).toBe(3);
 });
 it('protects a melodic pattern shared by a bass part',()=>{const score=fixture();score.parts.push({...score.parts[0]!,instrument:'bass',patternId:'melody'});expect(referenceMelodySlots(score).map(s=>s.id)).toEqual(['hook']);});
 it('keeps cancellation without requesting model output',async()=>{
  const controller=new AbortController();controller.abort();const reference={score:fixture(),durationSeconds:90};let calls=0;await expect(composeReference('reference',referenceCompositionSchema(input,reference) as Record<string,unknown>,async(_p,s)=>{calls++;return reply(s);},controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(calls).toBe(0);
 });
});
