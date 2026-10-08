import { describe,expect,it } from 'vitest';
import { llamaCompositionSchema } from './llamacpp-schema.js';
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
  it('separates drum pitches/references and retains the canonical schema unchanged',()=>{
    const before=JSON.stringify(COMPOSITION_SCHEMA);const schema=llamaCompositionSchema({prompt:'original',settings:{},variationCount:1}) as {properties:{patterns:{minItems:number;maxItems:number;items:{anyOf:{properties:{id:{enum:string[]};notes:{minItems:number;maxItems:number;items:{properties:{pitch:{enum:number[]}}}}}}[]}};parts:{items:{anyOf:{properties:{instrument:{enum:string[]};patternId:{enum:string[]};transpose?:{enum:number[]}}}[]}}}};
    expect(schema.properties.patterns.minItems).toBe(6);expect(schema.properties.patterns.maxItems).toBe(6);const patterns=schema.properties.patterns.items.anyOf;
    expect(patterns[0]!.properties.notes.minItems).toBe(6);expect(patterns[0]!.properties.notes.maxItems).toBe(6);expect(patterns[1]!.properties.notes.items.properties.pitch.enum).toContain(36);
    const parts=schema.properties.parts.items.anyOf;expect(parts[0]!.properties.instrument.enum).not.toContain('drums');expect(parts[1]!.properties.patternId.enum).toEqual(['d1','d2']);expect(parts[1]!.properties.transpose!.enum).toEqual([0]);
    expect(JSON.stringify(COMPOSITION_SCHEMA)).toBe(before);
  });
});
