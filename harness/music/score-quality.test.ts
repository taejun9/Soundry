import { it, expect } from 'vitest';
import type { Composition } from '../../backend/src/providers/composition/schema.js';
import { evaluateComposition } from './score-quality.js';
it('counts authored notes separately from repetitions and recognises equivalent interval motifs', () => {
  const notes = [0,1,2,3].map(beat=>({beat,duration:0.5,pitch:60+beat,velocity:0.8}));
  const score: Composition={version:1,bpm:120,genre:'House',mood:'test',seed:'qa',patterns:[{id:'lead',bars:1,notes},{id:'answer',bars:1,notes:notes.map(note=>({...note,pitch:note.pitch+12}))},{id:'kick',bars:1,notes:notes.map(note=>({...note,pitch:36}))}],parts:[{instrument:'piano',patternId:'lead',startBar:0,repeats:30,transpose:0,gain:0.5,pan:0},{instrument:'synth',patternId:'answer',startBar:30,repeats:30,transpose:0,gain:0.5,pan:0},{instrument:'drums',patternId:'kick',startBar:0,repeats:60,transpose:0,gain:0.5,pan:0}],sections:[{name:'intro',startBar:0,bars:6},{name:'verse',startBar:6,bars:15},{name:'chorus',startBar:21,bars:18},{name:'bridge',startBar:39,bars:9},{name:'outro',startBar:48,bars:12}]};
  const quality=evaluateComposition(score,120);
  expect(quality.authoredMelodicNotes).toBe(8); expect(quality.expandedNoteOnsets).toBe(480);
  expect(quality.uniqueIntervalRhythmMotifs).toBe(1); expect(quality.quarterKickTimelineCoverage).toBe(1);
  expect(quality.longestPatternRepetitionSeconds).toBe(60); expect(quality.melodicPitchRange).toEqual({minimum:60,maximum:75});
  expect(quality.subjectiveQuality).toBe('unassessed'); expect(quality.commercialReadiness).toBe('unassessed');
  expect(quality.observations.join(' ')).toContain('identical');
});
