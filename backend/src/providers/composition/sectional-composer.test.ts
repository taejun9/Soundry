import {describe,it,expect} from 'vitest';
import {llamaCompositionSchema} from './llamacpp-schema.js';
import {grooveProfile,sectionPhraseSchema,validatePhrase} from './sectional-composer.js';
const plan={tonic:0,mode:'major' as const,verse:[1,4,5,6,2,4,5,1],chorus:[1,4,5,6,2,4,5,1],bridge:[1,4,5,6,2,4,5,1],leadInstrument:'piano' as const,chordInstrument:'guitar' as const};
const phrase=()=>({lead:[[0,3,60,70],[8,3,64,65],[18,6,67,80],[36,6,72,75]],chords:[0,24].flatMap(t=>[60,64,67].map(p=>[t,6,p,60])),bass:[[0,6,36,70],[24,6,43,80]],drums:[[0,1,36,80],[12,1,38,70],[24,1,36,80],[36,1,38,70]]});
describe('requested groove relations',()=>{
 it('respects explicit straight rhythm and uses separate genre directions',()=>{
  expect(grooveProfile('funk','slap bass')).toBe('syncopated');expect(grooveProfile('reggae / dub','offbeat guitar')).toBe('offbeat');expect(grooveProfile('jazz','brushed drums')).toBe('swing');expect(grooveProfile('funk','straight eighths, no syncopation')).toBe('neutral');
 });
 it('takes the groove only from the selected request, not common instructions for other genres',()=>{
  const schema=llamaCompositionSchema({prompt:'Original bright pop, straight eighths',settings:{genre:'Pop',bpm:120,durationSeconds:120},variationCount:1}) as Record<string,unknown>;expect(schema['x-soundry-quality']).toMatchObject({groove:'neutral'});
  const hiphop=llamaCompositionSchema({prompt:'Original swung hip-hop',settings:{genre:'Hip-hop'},variationCount:1}) as Record<string,unknown>;expect(hiphop['x-soundry-quality']).toMatchObject({groove:'syncopated'});
 });
 it('uses eight swung subdivisions and separates normal, half-time and four-floor backbeats',()=>{
  const get=(genre:string,groove:'neutral'|'syncopated'|'swing',quarter=false)=>(sectionPhraseSchema(4,true,plan,'chorus',groove,quarter,genre) as {properties:{bar0:{properties:{drums:{properties:Record<string,{properties:{timing:{enum:number[][]}}}>}}}}}).properties.bar0.properties.drums.properties;
  const hiphop=get('hip-hop','syncopated');expect(Object.keys(hiphop).filter(k=>k.startsWith('hat'))).toHaveLength(8);
  expect(['hat1','hat3','hat5','hat7'].map(k=>hiphop[k]!.properties.timing.enum)).toEqual([[[8,1]],[[20,1]],[[32,1]],[[44,1]]]);
  expect(hiphop.backbeat!.properties.timing.enum).toEqual([[12,1]]);expect(hiphop.backbeat1!.properties.timing.enum).toEqual([[36,1]]);
  const trap=get('trap','neutral');expect(trap.backbeat!.properties.timing.enum).toEqual([[24,1]]);expect(trap).not.toHaveProperty('backbeat1');
  const house=get('house','neutral',true);expect(['hat0','hat1','hat2','hat3'].map(k=>house[k]!.properties.timing.enum)).toEqual([[[6,1]],[[18,1]],[[30,1]],[[42,1]]]);
 });
 it('rejects a syncopated genre candidate with entirely on-beat bass rather than rewriting it',()=>{
  const raw=phrase();expect(()=>validatePhrase(raw,1,plan,'verse',true,false,'syncopated')).toThrow();raw.bass[0]![0]=6;
  const output=validatePhrase(raw,1,plan,'verse',true,false,'syncopated');expect(output.bass[0]!.beat).toBe(0.5);expect(output.bass[0]!.pitch).toBe(36);
 });
 it('requires short actual offbeat chords and exposes model-selected timing choices',()=>{
  const raw=phrase();raw.bass[0]![0]=6;expect(()=>validatePhrase(raw,1,plan,'chorus',true,false,'offbeat')).toThrow();for(const n of raw.chords)n[0]!+=6;expect(validatePhrase(raw,1,plan,'chorus',true,false,'offbeat').chords[0]!.beat).toBe(0.5);
  const schema=sectionPhraseSchema(1,true,plan,'chorus','offbeat',true,'house') as {properties:{bar0:{properties:{bass:{prefixItems:{properties:{timing:{enum:number[][]}}}[]};chords:{prefixItems:{properties:{timing:{enum:number[][]}}}[]};drums:{properties:Record<string,{properties:{pitch:{enum:number[]};timing:{enum:number[][]}}}>}}}}};
  const row=schema.properties.bar0.properties;expect(row.bass.prefixItems[0]!.properties.timing.enum.every(t=>t[0]!%12!==0)).toBe(true);expect(row.chords.prefixItems.every(p=>p.properties.timing.enum.every(t=>t[0]!%12===6&&t[1]!<=6))).toBe(true);
  expect(['kick0','kick1','kick2','kick3'].map(key=>row.drums.properties[key]!.properties.timing.enum[0]![0])).toEqual([0,12,24,36]);expect(['kick0','kick1','kick2','kick3'].every(key=>row.drums.properties[key]!.properties.pitch.enum[0]===36)).toBe(true);
 });
});
