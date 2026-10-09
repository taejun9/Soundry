import type { GenerationInput } from '../../../../shared/contracts.js';
import { COMPOSITION_SCHEMA, INSTRUMENTS } from './schema.js';
const copy = (value: unknown): Record<string, unknown> => structuredClone(value) as Record<string, unknown>;
export function percussionExcluded(input: GenerationInput): boolean {
  return /(?:no|without|exclude)\s+(?:drums?|percussion)|(?:드럼|타악기)\s*(?:없이|없는|제외)/iu.test(input.prompt);
}
export function quarterKickRequested(input: GenerationInput): boolean {
  if (/(?:no|without|avoid|exclude)\s+(?:a\s+)?four[ -]?(?:on|to)[ -]?the[ -]?floor/iu.test(input.prompt)) return false;
  return !percussionExcluded(input) && /four[ -]?(?:on|to)[ -]?the[ -]?floor|4[ -]?on[ -]?the[ -]?floor|매\s*박(?:자)?\s*킥/iu.test(input.prompt);
}
export function percussionRequested(input: GenerationInput): boolean {
  if (percussionExcluded(input)) return false;
  return /drums?|percussion|shaker|kick|hi[ -]?hat|드럼|타악기|쉐이커|하이햇/iu.test(input.prompt)
    || ['hip-hop','trap','r&b / soul','pop','rock','funk','jazz','house','techno','drum & bass','latin','reggae / dub'].includes(input.settings.genre?.toLowerCase() ?? '');
}
/** Tighten form and drum references before inference; canonical validation still owns acceptance. */
export function llamaCompositionSchema(input: GenerationInput): object {
  const schema = copy(COMPOSITION_SCHEMA); const properties = schema.properties as Record<string, unknown>;
  for (const key of ['bpm','genre','mood','seed'] as const) if (input.settings[key] !== undefined) properties[key] = { ...copy(properties[key]), enum: [input.settings[key]] };
  const total = Math.ceil((input.settings.durationSeconds ?? 150) * (input.settings.bpm ?? 120) / 240);
  const lengths = [0.1,0.25,0.3,0.15].map(ratio => Math.max(1,Math.floor(total * ratio)));
  lengths.push(total - lengths.reduce((a,b) => a+b,0));
  let start = 0;
  const sections = ['intro','verse','chorus','bridge','outro'].map((name,index) => { const result = { name,startBar:start,bars:lengths[index]! }; start += result.bars; return result; });
  properties.sections = { type:'array',const:sections };
  const needsDrums = percussionRequested(input) || quarterKickRequested(input);
  const melodicIds = Array.from({length:needsDrums?4:8},(_,i) => 'm' + (i+1)); const drumIds = ['d1','d2'];
  const patternArray = copy(properties.patterns); const pattern = copy(patternArray.items); const patternProperties = pattern.properties as Record<string,unknown>;
  const notes = copy(patternProperties.notes); notes.maxItems = 6; const note = copy(notes.items); const noteProperties = note.properties as Record<string,unknown>;
  patternArray.minItems = 6; patternArray.maxItems = 6;
  const melodicBranches = needsDrums ? [
    { ...pattern, properties:{ ...patternProperties,id:{type:'string',enum:['m1','m2','m4']},bars:{type:'integer',minimum:1,maximum:2},notes:{...notes,minItems:6} } },
    { ...pattern, properties:{ ...patternProperties,id:{type:'string',enum:['m3']},bars:{type:'integer',minimum:1,maximum:2},notes:{...notes,minItems:6,items:{...note,properties:{...noteProperties,pitch:{type:'integer',minimum:28,maximum:52}}}} } },
  ] : [
    { ...pattern, properties:{ ...patternProperties,id:{type:'string',enum:melodicIds},bars:{type:'integer',minimum:1,maximum:2},notes:{...notes,minItems:6} } },
  ];
  const drumBranches = percussionExcluded(input) ? [] : quarterKickRequested(input) ? [
    { ...pattern, properties:{...patternProperties,id:{type:'string',enum:['d1']},bars:{type:'integer',enum:[1]},notes:{...notes,minItems:4,maxItems:4,items:{...note,properties:{...noteProperties,beat:{type:'number',enum:[0,1,2,3]},pitch:{type:'integer',enum:[36]},duration:{type:'number',minimum:0.0625,maximum:1}}}}} },
    { ...pattern, properties:{...patternProperties,id:{type:'string',enum:['d2']},bars:{type:'integer',minimum:1,maximum:2},notes:{...notes,items:{...note,properties:{...noteProperties,pitch:{type:'integer',enum:[36,38,39,42,46,45,48,49,51,37,54]}}}}} },
  ] : [
    { ...pattern, properties:{ ...patternProperties,id:{type:'string',enum:drumIds},bars:{type:'integer',minimum:1,maximum:2},notes:{...notes,items:{...note,properties:{...noteProperties,pitch:{type:'integer',enum:[36,38,39,42,46,45,48,49,51,37,54]}}}} } },
  ];
  patternArray.items = { anyOf: [...melodicBranches,...drumBranches] }; properties.patterns = patternArray;
  const parts = copy(properties.parts); const part = copy(parts.items); const partProperties = part.properties as Record<string,unknown>;
  parts.items = { anyOf: [
    { ...part,properties:{...partProperties,instrument:{type:'string',enum:INSTRUMENTS.filter(i=>i!=='drums')},patternId:{type:'string',enum:melodicIds}} },
    { ...part,properties:{...partProperties,instrument:{type:'string',enum:['drums']},patternId:{type:'string',enum:drumIds},transpose:{type:'integer',enum:[0]}} },
  ] }; properties.parts = parts;
  return schema;
}
