import { describe,expect,it } from 'vitest';
import { llamaCompositionSchema, percussionRequested, quarterKickRequested } from './llamacpp-schema.js';
import { COMPOSITION_SCHEMA } from './schema.js';
describe('local Gemma music constraints',()=>{
  it('keeps exact requested metadata and a complete bounded musical form across supported tempos',()=>{
    for(const [bpm,durationSeconds] of [[40,90],[120,90],[220,180],[113,150]]) {
      const schema=llamaCompositionSchema({prompt:'original',settings:{bpm,durationSeconds,genre:'Jazz',mood:'warm',seed:'exact-seed'},variationCount:1}) as {properties:{sections:{const:{name:string;startBar:number;bars:number}[]};bpm:{enum:number[]};seed:{enum:string[]}}};
      const form=schema.properties.sections.const;expect(form.map(s=>s.name)).toEqual(['intro','verse','chorus','bridge','outro']);
      let bars=0;for(const section of form){expect(section.startBar).toBe(bars);expect(section.bars).toBeGreaterThan(0);expect(section.bars).toBeLessThanOrEqual(64);bars+=section.bars;}
      expect(bars).toBe(Math.ceil(bpm! * durationSeconds! / 240));expect(schema.properties.bpm.enum).toEqual([bpm]);expect(schema.properties.seed.enum).toEqual(['exact-seed']);
    }
  });
  it('reserves four melodic and two percussion candidates and a genuinely low bass role',()=>{
    const input={prompt:'House with drums',settings:{genre:'House'},variationCount:1};
    const schema=llamaCompositionSchema(input) as {properties:{patterns:{items:{anyOf:{properties:{id:{enum:string[]};notes:{items:{properties:{pitch:{minimum?:number;maximum?:number}}}}}}[]}}}};
    const branches=schema.properties.patterns.items.anyOf;
    expect(branches.flatMap(branch=>branch.properties.id.enum).sort()).toEqual(['d1','d2','m1','m2','m3','m4']);
    expect(branches.find(branch=>branch.properties.id.enum.includes('m3'))!.properties.notes.items.properties.pitch).toEqual({type:'integer',minimum:28,maximum:52});
    expect(percussionRequested(input)).toBe(true);
    expect(percussionRequested({...input,prompt:'House without drums'})).toBe(false);
    const excluded=llamaCompositionSchema({...input,prompt:'House without drums'}) as typeof schema;
    expect(excluded.properties.patterns.items.anyOf.flatMap(branch=>branch.properties.id.enum)).not.toContain('d1');
    expect(percussionRequested({...input,prompt:'드럼 없이 하우스'})).toBe(false);
    expect(percussionRequested({prompt:'slow piano texture',settings:{genre:'Ambient'},variationCount:1})).toBe(false);
    expect(percussionRequested({prompt:'Cinematic growing percussion',settings:{genre:'Cinematic'},variationCount:1})).toBe(true);
  });
  it('makes an explicit four-on-the-floor request a four-kick one-bar candidate',()=>{
    const input={prompt:'House with four-on-the-floor drums',settings:{genre:'House'},variationCount:1};
    expect(quarterKickRequested(input)).toBe(true);
    expect(quarterKickRequested({...input,prompt:'House without four-on-the-floor drums'})).toBe(false);
    const schema=llamaCompositionSchema(input) as {properties:{patterns:{items:{anyOf:{properties:{id:{enum:string[]};bars:{enum:number[]};notes:{minItems:number;maxItems:number;items:{properties:{pitch:{enum:number[]};beat:{enum:number[]}}}}}}[]}}}};
    const kick=schema.properties.patterns.items.anyOf.find(branch=>branch.properties.id.enum.includes('d1'))!;
    expect(kick.properties.bars.enum).toEqual([1]);expect(kick.properties.notes.minItems).toBe(4);expect(kick.properties.notes.maxItems).toBe(4);
    expect(kick.properties.notes.items.properties.pitch.enum).toEqual([36]);expect(kick.properties.notes.items.properties.beat.enum).toEqual([0,1,2,3]);
  });
  it('separates drum pitches/references and retains the canonical schema unchanged',()=>{
    const before=JSON.stringify(COMPOSITION_SCHEMA);const schema=llamaCompositionSchema({prompt:'original',settings:{},variationCount:1}) as {properties:{patterns:{minItems:number;maxItems:number;items:{anyOf:{properties:{id:{enum:string[]};notes:{minItems:number;maxItems:number;items:{properties:{pitch:{enum:number[]}}}}}}[]}};parts:{items:{anyOf:{properties:{instrument:{enum:string[]};patternId:{enum:string[]};transpose?:{enum:number[]}}}[]}}}};
    expect(schema.properties.patterns.minItems).toBe(6);expect(schema.properties.patterns.maxItems).toBe(6);const patterns=schema.properties.patterns.items.anyOf;
    expect(patterns[0]!.properties.notes.minItems).toBe(6);expect(patterns[0]!.properties.notes.maxItems).toBe(6);expect(patterns[1]!.properties.notes.items.properties.pitch.enum).toContain(36);
    const parts=schema.properties.parts.items.anyOf;expect(parts[0]!.properties.instrument.enum).not.toContain('drums');expect(parts[1]!.properties.patternId.enum).toEqual(['d1','d2']);expect(parts[1]!.properties.transpose!.enum).toEqual([0]);
    expect(JSON.stringify(COMPOSITION_SCHEMA)).toBe(before);
  });
});
