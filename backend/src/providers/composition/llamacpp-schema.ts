import type { GenerationInput } from '../../../../shared/contracts.js';
import { COMPOSITION_SCHEMA } from './schema.js';
import { sectionalForm, grooveProfile } from './sectional-composer.js';
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
/** Use the canonical expressive range; a sectional runner emits compact phrases then converts to this score. */
export function llamaCompositionSchema(input: GenerationInput): object {
  const schema = copy(COMPOSITION_SCHEMA); const properties = schema.properties as Record<string, unknown>;
  for (const key of ['bpm','genre','mood','seed'] as const) if (input.settings[key] !== undefined) properties[key] = { ...copy(properties[key]), enum: [input.settings[key]] };
  const total = Math.ceil((input.settings.durationSeconds ?? 150) * (input.settings.bpm ?? 120) / 240);
  properties.sections = { type:'array',const:sectionalForm(total) };
  schema['x-soundry-quality'] = {version:2,drums:percussionRequested(input),quarterKick:quarterKickRequested(input),groove:grooveProfile(input.settings.genre?.toLowerCase()??'',input.prompt)};
  return schema;
}
