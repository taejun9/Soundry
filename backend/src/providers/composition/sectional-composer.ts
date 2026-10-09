import type { Composition, Instrument, Note, Pattern, Section } from './schema.js';
import { ProviderError } from '../provider-error.js';
import { throwIfCancelled } from '../cli-runner.js';

export type ChatComposer = (prompt: string, schema: object, signal: AbortSignal) => Promise<unknown>;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = (min: number, max: number) => ({type:'integer',minimum:min,maximum:max});
const object = (properties: Record<string,unknown>) => ({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const array = (items: object, minItems: number, maxItems: number) => ({type:'array',items,minItems,maxItems});
const allowedDrums = [36,38,39,42,46,45,48,49,51,37,54];
export type GrooveProfile = 'neutral' | 'syncopated' | 'offbeat' | 'swing';
export function grooveProfile(genre: string, prompt: string): GrooveProfile {
  if(/(?:no|without|avoid)\s+(?:syncopation|swing)|straight\s+(?:rhythm|eighths)|정박\s*(?:위주|만)/iu.test(prompt)) return 'neutral';
  if(genre.includes('reggae')||/offbeat\s+(?:guitar|chords)/iu.test(prompt))return 'offbeat';
  if(['funk','latin'].includes(genre))return 'syncopated';
  if(genre==='hip-hop')return 'syncopated';
  if(genre==='jazz'||/swung|swing/iu.test(prompt))return 'swing';
  return 'neutral';
}
const grooveDirections: Record<GrooveProfile,string> = {
  neutral:'Keep the requested genre rhythm; choose rhythmic placement independently for each role. Use accents, meaningful rests, hat subdivisions and a fill rather than a generic kick-only pulse.',
  syncopated:'Rhythmic identity is essential: use anticipations, short bass gates, offbeat attacks, tight contrasting drum accents and answering phrases. At least one bass attack per bar must lie between integer quarter beats. Do not give every instrument the same rhythm.',
  offbeat:'Use short offbeat guitar/keyboard skanks on the eighth-note upbeats, deep syncopated bass, relaxed drums and space. At least one bass attack per bar is off the integer beat; chord attacks are on eighth-note upbeats with short gates. Avoid a straight rock backbeat throughout.',
  swing:'Use a clear swung/triplet subdivision, soft contrasting ghost notes and syncopated answering phrases. Choose some lead/bass/hat onsets at third-of-beat positions. Bass timing must not simply copy chord attacks. Preserve room for phrasing.'
};
const kitGenres=['hip-hop','trap','r&b / soul','pop','rock','funk','jazz','house','techno','drum & bass','latin','reggae / dub'];
const eighthKitGenres=['hip-hop','trap','pop','rock','funk','jazz','drum & bass','latin'];
const melodicInstruments = ['piano','guitar','strings','brass','synth','organ','bell','pad'];
class PhraseError extends ProviderError { constructor(readonly issue: string) { super('LOCAL_INVALID_OUTPUT'); } }
function invalid(issue = 'Schema, per-bar coverage or harmonic relation is invalid.'): never { throw new PhraseError(issue); }
interface TonalPlan { tonic: number; mode: 'major' | 'minor'; verse: number[]; chorus: number[]; bridge: number[]; leadInstrument: Instrument; chordInstrument: Instrument }
export const TONAL_PLAN_SCHEMA = object({tonic:integer(0,11),mode:{type:'string',enum:['major','minor']},
  verse:array(integer(1,7),8,8),chorus:array(integer(1,7),8,8),bridge:array(integer(1,7),8,8),
  leadInstrument:{type:'string',enum:melodicInstruments},chordInstrument:{type:'string',enum:melodicInstruments}});
/** Align non-outro sections to phrase boundaries to avoid harmonic spill into the following section. */
export function sectionalForm(total: number): Section[] {
  const step = total >= 28 ? 4 : 1;
  const lengths = [0.08,0.22,0.24,0.14,0.24].map(r => Math.max(step,Math.floor(total*r/step)*step));
  while (lengths.reduce((a,b)=>a+b,0) >= total) {
    const largest=lengths.indexOf(Math.max(...lengths)); if (lengths[largest]! <= step) invalid(); lengths[largest]! -= step;
  }
  let outro=total-lengths.reduce((a,b)=>a+b,0);
  while(outro>8) { lengths[4]! += step; outro -= step; }
  lengths.push(outro); let start=0;
  return (['intro','verse','chorus','bridge','chorus','outro'] as const).map((name,index)=>{const row={name,startBar:start,bars:lengths[index]!};start+=row.bars;return row;});
}
export function phraseBars(section: Section): number { return section.bars <= 4 ? section.bars : section.bars % 4 === 0 ? 4 : section.bars; }
function planFrom(value: unknown): TonalPlan {
  if(!record(value)||Object.keys(value).length!==7||!Number.isInteger(value.tonic)||Number(value.tonic)<0||Number(value.tonic)>11||!['major','minor'].includes(value.mode as string)||!melodicInstruments.includes(value.leadInstrument as string)||!melodicInstruments.includes(value.chordInstrument as string)) invalid();
  for(const key of ['verse','chorus','bridge']) if(!Array.isArray(value[key])||value[key].length!==8||value[key].some((degree:unknown)=>!Number.isInteger(degree)||Number(degree)<1||Number(degree)>7)||new Set(value[key]).size<3) invalid();
  return value as unknown as TonalPlan;
}
function chordPitches(plan: TonalPlan, degree: number): number[] {
  const scale=plan.mode==='major'?[0,2,4,5,7,9,11]:[0,2,3,5,7,8,10];
  return [0,2,4,6,8].map(offset=>(plan.tonic+scale[(degree-1+offset)%7]!)%12);
}
function progression(plan: TonalPlan, name: string, bars = 8): number[] {
  return name==='chorus'?plan.chorus:name==='bridge'?plan.bridge:name==='outro'?Array.from({length:bars},(_,bar)=>bar===bars-1?1:bar===bars-2?5:plan.verse[bar%8]!):plan.verse;
}
function voicingChoices(pcs: number[]): number[][] {
  const choices:number[][]=[];
  for(const octave of [48,60]) {
    const root=octave+pcs[0]!,third=root+(pcs[1]!-pcs[0]!+12)%12,fifth=root+(pcs[2]!-pcs[0]!+12)%12,seventh=root+(pcs[3]!-pcs[0]!+12)%12,ninth=root+12+(pcs[4]!-pcs[0]!+12)%12;
    for(const voices of [[root,third,fifth],[third,fifth,root+12],[fifth,root+12,third+12],[root,fifth,third+12],[root,third,fifth,seventh],[third,seventh,root+12,fifth+12],[root,third,fifth,ninth]])
      if(voices.every(p=>p>=48&&p<=84)&&new Set(voices.map(p=>p%12)).size>=3) choices.push(voices);
  }
  return choices;
}
export function sectionPhraseSchema(bars: number, drums: boolean, plan?: TonalPlan, name = 'verse', groove: GrooveProfile = 'neutral', quarterKick = false,genre = ''): object {
  const timings=(drum=false) => drum?Array.from({length:48},(_,tick)=>[tick,1]):[0,3,4,6,8,9,12,16,18,20,24,30,36,42].flatMap(tick=>[3,4,6,8,12,18,24,36,48].filter(gate=>tick+gate<=48).map(gate=>[tick,gate]));
  const note=(pitches: number[],drum=false) => object({timing:{type:'array',enum:timings(drum)},pitch:{type:'integer',enum:pitches},velocity:{type:'integer',enum:[15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100]}});
  const separatedAttacks=(base: ReturnType<typeof object>,syncopated=false,offbeatChords=false) => ({type:'array',prefixItems:[0,1].map(slot=>object({...base.properties,timing:{type:'array',enum:timings().filter(t=>(slot===0?t[0]!<24:t[0]!>=24)&&(!syncopated||slot!==0||t[0]!%12!==0)&&(!offbeatChords||(t[0]!%12===6&&t[1]!<=6)))}})),minItems:2,maxItems:2});
  const mainGroove=['verse','chorus','bridge'].includes(name);
  const fullKick=quarterKick&&['verse','chorus'].includes(name);
  const hasKit=kitGenres.includes(genre);
  const swingHats=groove==='swing'||genre==='hip-hop'&&groove!=='neutral';
  const hatPitch=genre==='jazz'?[51,42]:genre==='latin'?[54,42]:[42,46];
  const subdivisions=eighthKitGenres.includes(genre)?8:4;
  const hats=Array.from({length:subdivisions},(_,slot)=>{
    const width=48/subdivisions;const ticks=Array.from({length:width},(_,n)=>slot*width+n).filter(t=>swingHats?(slot%2===1?t%12===8:t%12===0||t%12===4):['house','techno','reggae / dub'].includes(genre)?t%12===6:t%3===0);
    return object({...note(hatPitch,true).properties,timing:{type:'array',enum:ticks.map(t=>[t,1])},velocity:{type:'integer',enum:[20,25,30,35,40,45,50,55,60]}});
  });
  const backbeats=genre==='trap'||genre==='reggae / dub'?[24]:['hip-hop','r&b / soul','pop','rock','funk','house','techno','drum & bass'].includes(genre)?[12,36]:[];
  const backbeatPitches=genre==='jazz'||genre==='latin'?[37,38]:genre==='reggae / dub'?[37,38,39]:[38,39];
  const backbeatNotes=backbeats.length?backbeats.map(tick=>object({...note(backbeatPitches,true).properties,timing:{type:'array',enum:[[tick,1]]}})):[note(backbeatPitches,true)];
  const kitNotes=[...(fullKick?[0,12,24,36].map(tick=>object({...note([36],true).properties,timing:{type:'array',enum:[[tick,1]]}})):[note([36],true)]),...backbeatNotes,...hats];
  const kitNames=[...(fullKick?['kick0','kick1','kick2','kick3']:['kick0']),...backbeatNotes.map((_,index)=>index===0?'backbeat':'backbeat1'),...hats.map((_,index)=>'hat'+index)];
  const drumSchema=mainGroove&&(hasKit||fullKick)?object({...Object.fromEntries(kitNames.map((key,index)=>[key,kitNotes[index]])),fills:array(note([36,38,39,45,48,49,37,54],true),0,Math.min(2,16-kitNotes.length))}):array(note(allowedDrums,true),name==='chorus'?4:0,12);
  const notes: Record<string,unknown>={};
  for(let bar=0;bar<bars;bar++) {
    const pcs=plan?chordPitches(plan,progression(plan,name,bars)[bar%8]!):Array.from({length:12},(_,i)=>i);
    const voicings=voicingChoices(pcs);
    const bassRange=Array.from({length:25},(_,i)=>i+28).filter(p=>pcs.slice(0,3).includes(p%12));
    notes['bar'+bar]=object({lead:array(note(Array.from({length:34},(_,i)=>i+55)),3,5),chords:separatedAttacks(object({timing:{type:'array',enum:timings()},voices:{type:'array',enum:voicings},velocity:{type:'integer',enum:[30,40,50,60,70,80,90]}}),false,mainGroove&&groove==='offbeat'),bass:separatedAttacks(note(bassRange),mainGroove&&['syncopated','offbeat'].includes(groove)),...(drums?{drums:drumSchema}:{})});
  }
  return object(notes);
}
export function decodeSectionBars(raw: unknown,bars: number,drums: boolean): Record<string,number[][]> {
  if(!record(raw)||Object.keys(raw).length!==bars) invalid('Return one object per requested bar, named bar0, bar1, etc.');
  const layers=['lead','chords','bass',...(drums?['drums']:[])];
  const result=Object.fromEntries(layers.map(layer=>[layer,[] as number[][]]));
  for(let bar=0;bar<bars;bar++) {
    const row=raw['bar'+bar];if(!record(row)||Object.keys(row).length!==layers.length) invalid(`Missing or unknown layer in bar${bar}.`);
    for(const layer of layers) {
      let notes=row[layer];
      if(layer==='drums'&&record(notes)){if(!Object.keys(notes).every(key=>/^(?:kick[0-3]|backbeat[01]?|hat[0-7]|fills)$/.test(key))||!Array.isArray(notes.fills))invalid('Named drum roles and fills are invalid.');notes=Object.entries(notes).flatMap(([key,value])=>key==='fills'?value as unknown[]:[value]);}
      if(!Array.isArray(notes)) invalid(`bar${bar}.${layer} must be a note array.`);
      const [min,max]=layer==='lead'?[3,5]:layer==='chords'?[2,3]:layer==='bass'?[2,4]:[0,16];
      if(notes.length<min!||notes.length>max!)invalid(`bar${bar}.${layer} needs ${min}..${max} notes.`);
      if(layer==='chords') {
        for(const voicing of notes) {
          if(!record(voicing)||Object.keys(voicing).length!==3||!Array.isArray(voicing.timing)||voicing.timing.length!==2||voicing.timing.some(n=>!Number.isInteger(n))||Number(voicing.timing[0])<0||Number(voicing.timing[0])+Number(voicing.timing[1])>48||Number(voicing.timing[1])<1||!Number.isInteger(voicing.velocity)||!Array.isArray(voicing.voices)||voicing.voices.length<3||voicing.voices.length>4||voicing.voices.some(p=>!Number.isInteger(p))||new Set(voicing.voices.map(p=>Number(p)%12)).size<3) invalid(`bar${bar}.chords needs simultaneous voicings with at least three DIFFERENT pitch classes, t+gate<=48.`);
          for(const pitch of voicing.voices)result[layer]!.push([Number((voicing.timing as number[])[0])+bar*48,Number((voicing.timing as number[])[1]),Number(pitch),Number(voicing.velocity)]);
        }
        continue;
      }
      for(const n of notes) {
        if(!record(n)||Object.keys(n).length!==3||!Array.isArray(n.timing)||n.timing.length!==2||n.timing.some(t=>!Number.isInteger(t))||n.timing[0]<0||n.timing[0]>47||n.timing[1]<1||n.timing[0]+n.timing[1]>48||!Number.isInteger(n.pitch)||!Number.isInteger(n.velocity)) invalid(`bar${bar}.${layer}: note needs timing[tick,gate], pitch, velocity; onset+gate<=48.`);
        result[layer]!.push([n.timing[0]+bar*48,n.timing[1],Number(n.pitch),Number(n.velocity)]);
      }
    }
  }
  return result;
}

function readNotes(value: unknown,bars: number,min: number,max: number,pitches: (n:number)=>boolean): Note[] {
  if(!Array.isArray(value)||value.length<min||value.length>max) invalid(`Layer needs ${min}..${max} notes.`);
  const notes=value.map(raw=>{
    if(!Array.isArray(raw)||raw.length!==4||raw.some(n=>!Number.isInteger(n))||raw[0]<0||raw[1]<1||raw[1]>64||!pitches(raw[2])||raw[3]<15||raw[3]>100) invalid('Every note is [integer tick, integer gate 1..64, allowed MIDI pitch, integer velocity 15..100].');
    if(raw[0]+raw[1]>bars*48) invalid(`Note at tick ${raw[0]} with gate ${raw[1]} ends at ${raw[0]+raw[1]}, beyond the phrase end ${bars*48}. LAST VALID onset is ${bars*48-1}. Never use tick ${bars*48} or later.`);
    return {beat:raw[0]/12,duration:raw[1]/12,pitch:raw[2],velocity:raw[3]/100};
  }).sort((a,b)=>a.beat-b.beat||a.pitch-b.pitch);
  if(new Set(notes.map(n=>`${n.beat}:${n.pitch}`)).size!==notes.length) invalid('Duplicate pitch at the same onset in one layer. Each note must have a unique onset/pitch pair.');
  return notes;
}
export interface Phrase { lead: Note[]; chords: Note[]; bass: Note[]; drums?: Note[] }
export function validatePhrase(value: unknown,bars: number,plan: TonalPlan,name: string,drums: boolean,quarterKick: boolean,groove: GrooveProfile = 'neutral',genre = ''): Phrase {
  if(!record(value)||Object.keys(value).length!==(drums?4:3)||!['lead','chords','bass',...(drums?['drums']:[])].every(key=>Object.hasOwn(value,key))) invalid();
  const lead=readNotes(value.lead,bars,bars*3,bars*5,p=>p>=55&&p<=88);
  const chords=readNotes(value.chords,bars,bars*6,bars*12,p=>p>=48&&p<=84);
  const bass=readNotes(value.bass,bars,bars*2,bars*4,p=>p>=28&&p<=52);
  const rhythm=drums?readNotes(value.drums,bars,0,Math.min(128,bars*16),p=>allowedDrums.includes(p)):undefined;
  if(drums&&name==='chorus'&&(!rhythm||rhythm.length<bars*4))invalid('The chorus needs a real percussion groove with at least four hits per bar.');
  const degrees=progression(plan,name,bars);
  // Chord-tone coverage is a relation check, not a perceptual music rating.
  const chordFit=chords.filter(n=>chordPitches(plan,degrees[Math.floor(n.beat/4)%8]!).includes(n.pitch%12)).length/chords.length;
  const bassFit=bass.filter(n=>chordPitches(plan,degrees[Math.floor(n.beat/4)%8]!).slice(0,3).includes(n.pitch%12)).length/bass.length;
  for(let bar=0;bar<bars;bar++) {
    const c=chords.filter(n=>Math.floor(n.beat/4)===bar),b=bass.filter(n=>Math.floor(n.beat/4)===bar),pcs=chordPitches(plan,degrees[bar%8]!);
    if(!c.length||!b.length||c.filter(n=>pcs.includes(n.pitch%12)).length/c.length<0.7||b.filter(n=>pcs.slice(0,3).includes(n.pitch%12)).length/b.length<0.6) invalid(`bar${bar} chord/bass must match pitch classes ${pcs.join(',')}.`);
  }
  if(chordFit<0.7||bassFit<0.6) invalid(`Chord fit ${(chordFit*100).toFixed(0)}%, bass fit ${(bassFit*100).toFixed(0)}%. Use the listed pitch classes for each bar; bass must use root/third/fifth only. Add the tonic pitch class to the ROOT, not every chord tone twice.`);
  if(new Set(lead.map(n=>n.pitch)).size<4) invalid('Lead must use at least four different pitches.');
  const onsets=new Map<number,Set<number>>();for(const n of chords){const set=onsets.get(n.beat)??new Set();set.add(n.pitch%12);onsets.set(n.beat,set);}
  if([...onsets.values()].filter(set=>set.size>=3).length<bars) invalid('Too few simultaneous chords with three distinct pitch classes.');
  for(let bar=0;bar<bars;bar++) if(!chords.some(n=>Math.floor(n.beat/4)===bar)||!bass.some(n=>Math.floor(n.beat/4)===bar)||!lead.some(n=>Math.floor(n.beat/4)===bar)) invalid();
  if(drums&&kitGenres.includes(genre)&&['verse','chorus','bridge'].includes(name))for(let bar=0;bar<bars;bar++){
    const hits=rhythm!.filter(n=>Math.floor(n.beat/4)===bar);const hatPitches=genre==='jazz'?[51,42]:genre==='latin'?[54,42]:[42,46];
    const hats=hits.filter(n=>hatPitches.includes(n.pitch));
    if(!hits.some(n=>n.pitch===36)||!hits.some(n=>[37,38,39].includes(n.pitch))||hats.length<(eighthKitGenres.includes(genre)?8:4))invalid(`bar${bar} needs independent kick, backbeat and genre subdivision roles.`);
    if((groove==='swing'||genre==='hip-hop'&&groove!=='neutral')&&hats.filter(n=>Math.abs(n.beat%1-2/3)<0.00001).length<4)invalid(`bar${bar} needs the requested swung hat/ride subdivision.`);
  }
  if(quarterKick&&['verse','chorus'].includes(name)) for(let beat=0;beat<bars*4;beat++) if(!rhythm?.some(n=>n.pitch===36&&n.beat===beat)) invalid(`Missing requested kick at quarter beat ${beat}. Place pitch36 at ticks0,12,24,36 in EVERY bar.`);
  if(['verse','chorus','bridge'].includes(name)&&['syncopated','offbeat'].includes(groove))for(let bar=0;bar<bars;bar++)if(!bass.some(n=>Math.floor(n.beat/4)===bar&&Math.abs(n.beat-Math.round(n.beat))>0.01))invalid(`bar${bar} needs an independent syncopated bass attack between integer beats.`);
  if(groove==='offbeat'&&['verse','chorus','bridge'].includes(name)&&chords.some(n=>Math.abs(n.beat%1-0.5)>0.00001||n.duration>0.5))invalid('Requested offbeat chord skanks need eighth-note upbeat attacks and short gates.');
  return {lead,chords,bass,...(rhythm?.length?{drums:rhythm}:{})};
}
/** A failed three-pitch candidate gets a model-written answering note, never an app-written patch. */
function answerRepairSchema(schema: object,bars: number,previous: unknown,drums: boolean,plan: TonalPlan): object {
  const pitches=new Set(decodeSectionBars(previous,bars,drums).lead!.map(n=>n[2]!));
  const scale=(plan.mode==='major'?[0,2,4,5,7,9,11]:[0,2,3,5,7,8,10]).map(n=>(n+plan.tonic)%12);
  const fresh=Array.from({length:34},(_,n)=>n+55).filter(n=>!pitches.has(n)&&scale.includes(n%12));
  if(!fresh.length)invalid();
  const repaired=structuredClone(schema) as {properties:Record<string,{properties:{lead:{items:{properties:Record<string,unknown>}}}}>} ;
  const row=repaired.properties['bar'+(bars-1)]!;const note=row.properties.lead.items;
  const answer={...structuredClone(note),properties:{...structuredClone(note.properties),pitch:{type:'integer',enum:fresh}}};
  (row.properties as Record<string,unknown>).lead={type:'array',prefixItems:[note,note,note,answer],minItems:4,maxItems:4};
  return repaired;
}
/** Multiple bounded model-written phrases. The application supplies timing and conversion, not a fixed tune. */
export async function composeSectional(prompt: string,schema: Record<string,unknown>,chat: ChatComposer,signal: AbortSignal): Promise<Composition> {
  const properties=schema.properties as Record<string,{enum?:unknown[];const?:unknown[]}>;
  const metadata=Object.fromEntries(['bpm','genre','mood','seed'].map(key=>[key,properties[key]!.enum?.[0]??(key==='bpm'?120:key==='genre'?'Instrumental':key==='mood'?'expressive':'local')]));
  const sections=properties.sections!.const as Section[];
  const config=schema['x-soundry-quality'] as {version:number;drums:boolean;quarterKick:boolean;groove?:GrooveProfile};
  const genre=String(metadata.genre).toLowerCase();
  const groove=config.groove??grooveProfile(genre,'');
  const instruments=genre.includes('jazz')?['piano','brass','guitar','organ']:genre==='rock'||genre.includes('folk')?['guitar','piano','strings']:genre.includes('classical')?['piano','strings']:genre==='ambient'?['pad','piano','bell','strings']:melodicInstruments;
  const tonalSchema=object({...TONAL_PLAN_SCHEMA.properties,leadInstrument:{type:'string',enum:instruments},chordInstrument:{type:'string',enum:instruments}});
  const plan=planFrom(await chat(prompt+'\nHARMONIC PLAN: Choose an original coherent key, two contrasting eight-bar harmonic progressions (verse/chorus), and an eight-bar bridge. Each integer is a DIATONIC chord degree 1..7, one chord per bar. Include at least three different degrees in each progression. Pick suitable lead/chord instruments, no text or notes yet. Treat any example as direction, never copy a known tune.',tonalSchema,signal));
  const patterns: Pattern[]=[],parts: Composition['parts']=[];
  let previousLead: Note[]=[],firstChorus: Note[]=[];
  for(const [index,section] of sections.entries()) {
    throwIfCancelled(signal);const bars=phraseBars(section);const degrees=progression(plan,section.name,bars);
    const chords=Array.from({length:bars},(_,bar)=>({bar,degree:degrees[bar%8],pitchClasses:chordPitches(plan,degrees[bar%8]!)}));
    const instruction=`\nSECTION ${index+1}/${sections.length} ${section.name}: Write a new ${bars}-bar phrase, not copies of a one-bar loop. Output compact note objects {timing:[tick,lengthTicks],pitch:MIDIpitch,velocity:percent}, tick=one TWELFTH of a quarter-note beat, 48 ticks/bar, 12 ticks/quarter. This grid supports straight and triplet/swing rhythms. Return separate bar0..bar${bars-1} objects. Inside EACH bar restart ticks at0 and use only0..47, onset+gate<=48. The APP adds the bar offset; do NOT add48 yourself. The chords layer uses objects {timing:[tick,gate],voices:[MIDI pitch1,pitch2,pitch3,pitch4 optional],velocity}. Choose one of the supplied diatonic voicing arrays; every candidate contains a real triad with optional seventh/ninth. Change inversion/register and attacks to fit the phrase; do not invent unlisted voicings. Write two voiced chords per bar; the first attack is in ticks0..23 and the second in24..47. Bass uses the same separated half-bar windows but chooses its own rhythm/pitch with changing inversion and harmonic rhythm. Lead/bass/drums use timing/pitch/velocity objects. Select a timing pair from the schema; all supplied pairs already fit one bar. Bass independent low 28..52, matching the current chord root/third/fifth. Lead 55..88 has an original singable motif and a developing answer, rests, varied gates and velocity; use 3..5 notes/bar, do not play only an ascending scale or even eighth-notes. Use one coherent key: ${plan.tonic} pitch class ${plan.mode}. For verse establish theme, chorus strengthen hook, bridge develop/contrast, second chorus vary and return, outro resolve to tonic. Choose timings from the full grammar, with role-specific accents and rests; no shared default onset template. RESTART at0 for every bar object. Maximum gate48, drums gate1. Melodic/bass gates are3..48 ticks; vary short and sustained gates to preserve phrasing. When swing is requested, use eighth offsets0/8 inside a12-tick beat rather than evenly spaced0/6. Straight grooves use0/6. Vary these timing examples for the genre. This is notation guidance, not a fixed melody. Minimum notes: lead ${bars*3}, chords ${bars*6}, bass ${bars*2}. Chords can be seventh/ninth voicings; use chord pitch classes below for each onset.\nGROOVE PRIORITY: ${grooveDirections[groove]} ${genre==='hip-hop'&&groove!=='neutral'?'Use swung hats and syncopated low bass. ':''} Main-section drums are a NAMED ROLE OBJECT: kick0 (kick1..3 when required), backbeat (and backbeat1 when present), hat0..hatN, and a fills array. Write each named note in its own timing/pitch/velocity object. Intro/outro drum layers may be note arrays. The app flattens these roles; do not return a flat drum array for main sections. Keep each required role; do not substitute a kick-only pulse. Ticks still restart in each bar.\nHarmony per bar:\n${JSON.stringify(chords)}\nPrevious lead motif for musical continuity (develop it; do not duplicate the whole phrase):\n${JSON.stringify((section.name==='chorus'&&firstChorus.length?firstChorus:previousLead).slice(0,16))}\n${config.drums?'Write a stylistically correct drum groove with accents, ghost notes and an end fill. Empty drum arrays are allowed in the intro/bridge/outro for contrast; chorus needs at least four hits per bar. Drum MIDI pitches ONLY '+allowedDrums.join(',')+'. ': 'NO drums or percussion. '}${config.quarterKick&&['verse','chorus'].includes(section.name)?'EVERY integer beat in this phrase must have a pitch36 kick. Other percussion supplies syncopation. ':''}Avoid notes piled onto the same pitch/onset and arbitrary register jumps. The outro should relax dynamics and finish on tonic chord tones.`;
    const stageSchema=sectionPhraseSchema(bars,config.drums,plan,section.name,groove,config.quarterKick,genre);
    let phrase: Phrase|undefined,previous:unknown,issue='';
    for(let attempt=0;attempt<2;attempt++) {
      const needsAnswer=attempt===1&&issue==='Lead must use at least four different pitches.';
      const repairSchema=needsAnswer?answerRepairSchema(stageSchema,bars,previous,config.drums,plan):stageSchema;
      const answerInstruction=needsAnswer?'\nLead repair: preserve the recognizable motif, but the LAST BAR must have FOUR lead notes. Its fourth note must be a new diatonic answering pitch absent from the failed candidate, selected from the grammar. Do not repeat the three-pitch candidate unchanged.':'';
      const raw=await chat(prompt+instruction+answerInstruction+(attempt?'\nEXACT VALIDATION FAILURE: '+issue+'\nThe previous candidate failed the musical relation validator. Correct note ends, duplicated onsets, per-bar coverage, simultaneous chord voicings, chord/bass pitch-class alignment and requested kick grid. Return the corrected entire phrase.\nCandidate:\n'+JSON.stringify(previous):''),repairSchema,signal);
      try {phrase=validatePhrase(decodeSectionBars(raw,bars,config.drums),bars,plan,section.name,config.drums,config.quarterKick,groove,genre);break;} catch(error) {if(!(error instanceof ProviderError))throw error;previous=raw;issue=error instanceof PhraseError?error.issue:'Invalid relation';}
    }
    if(!phrase) invalid(issue);
    previousLead=phrase.lead;if(section.name==='chorus'&&!firstChorus.length)firstChorus=phrase.lead;
    const level=section.name==='intro'?0.65:section.name==='outro'?0.6:section.name==='bridge'?0.8:section.name==='chorus'?1:0.85;
    for(const [role,notes] of Object.entries(phrase) as [keyof Phrase,Note[]][]) {
      const id=`s${index}_${role}`;patterns.push({id,bars,notes});
      const instrument: Instrument=role==='lead'?plan.leadInstrument:role==='chords'?plan.chordInstrument:role==='bass'?'bass':'drums';
      parts.push({instrument,patternId:id,startBar:section.startBar,repeats:Math.ceil(section.bars/bars),transpose:0,gain:(role==='lead'?0.5:role==='chords'?0.3:role==='bass'?0.5:0.55)*level,pan:role==='chords'?-0.25:role==='lead'?0.12:0});
    }
  }
  return {version:1,bpm:metadata.bpm as number,genre:metadata.genre as string,mood:metadata.mood as string,seed:metadata.seed as string,sections,patterns,parts};
}
