/**
 * 작곡 adapter가 사용하는 공개 진입점이다. 제한된 악보 계약과 renderer만 재수출해 내부 DSP 세부사항을 숨긴다.
 * 외부 텍스트는 parseComposition을 통과한 후 renderComposition에 전달해야 한다.
 */
export { COMPOSITION_SCHEMA, COMPOSITION_INSTRUCTIONS, CompositionError, parseComposition } from './schema.js';
export type { Composition } from './schema.js';
export { renderComposition } from './renderer.js';
