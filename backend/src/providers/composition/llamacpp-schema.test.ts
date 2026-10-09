import { describe,expect,it } from 'vitest';
import { llamaCompositionSchema,percussionRequested,quarterKickRequested } from './llamacpp-schema.js';
import { sectionalForm,phraseBars } from './sectional-composer.js';
import { COMPOSITION_SCHEMA } from './schema.js';
describe('expressive local Gemma score contract',()=>{
  it('retains the full canonical expressive schema and binds requested metadata',()=>{
    const before=JSON.stringify(COMPOSITION_SCHEMA);const schema=llamaCompositionSchema({prompt:'Jazz drums',settings:{bpm:116,durationSeconds:120,genre:'Jazz',mood:'warm',seed:'exact'},variationCount:1}) as {properties:{patterns:unknown;bpm:{enum:number[]};seed:{enum:string[]}};'x-soundry-quality':{version:number;drums:boolean}};
    expect(schema.properties.patterns).toEqual(COMPOSITION_SCHEMA.properties.patterns);expect(schema.properties.bpm.enum).toEqual([116]);expect(schema.properties.seed.enum).toEqual(['exact']);
    expect(schema['x-soundry-quality']).toMatchObject({version:2,drums:true});expect(JSON.stringify(COMPOSITION_SCHEMA)).toBe(before);
  });
  it('makes every phrase fit its section without spilling harmony at supported durations and tempos',()=>{
    for(let bpm=40;bpm<=220;bpm++)for(const duration of [90,120,150,180]) {
      const total=Math.ceil(bpm*duration/240),form=sectionalForm(total);let end=0;
      expect(form.map(s=>s.name)).toEqual(['intro','verse','chorus','bridge','chorus','outro']);
      for(const row of form){expect(row.startBar).toBe(end);expect(row.bars).toBeGreaterThan(0);expect(row.bars).toBeLessThanOrEqual(64);expect(row.bars%phraseBars(row)).toBe(0);end+=row.bars;}
      expect(end).toBe(total);
    }
  });
  it('honors explicit percussion exclusions and quarter kick requests',()=>{
    const input={prompt:'House four-on-the-floor drums',settings:{genre:'House'},variationCount:1};
    expect(quarterKickRequested(input)).toBe(true);expect(quarterKickRequested({...input,prompt:'House without four-on-the-floor drums'})).toBe(false);
    expect(percussionRequested(input)).toBe(true);expect(percussionRequested({...input,prompt:'House without drums'})).toBe(false);expect(percussionRequested({...input,prompt:'드럼 없이 하우스'})).toBe(false);
    expect(percussionRequested({prompt:'slow piano texture',settings:{genre:'Ambient'},variationCount:1})).toBe(false);
  });
});
