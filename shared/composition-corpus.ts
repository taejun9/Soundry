/** Soundry original compositional guidance, not copied songs, scores, or model training data. */
const rows: [string, string, number, string[]][] = [
  ['Hip-hop','힙합',88,[
    'Build a short two-bar hook, answer it in a different register, and reserve the fullest answer for the chorus. Retain a recognisable rhythmic cell across all five sections.',
    'Choose one minor or modal tonal centre. Make a bass motif use roots and a single approach tone; place warm piano thirds/sevenths above the bass rather than doubling its low notes.',
    'In a two-bar drum motif, anchor snares on beats 1 and 3 of each four-beat bar (zero-based), offset a few hats slightly, and vary one kick pickup. Do not distribute every hit evenly.',
    'Leave rests around the hook. Write a second melodic motif with a changed final interval; repeated identical pitch and rhythm for the entire song is a draft, not developed writing.',
    'Use piano and bass as separate patterns. Thin the intro and bridge, strengthen the chorus with an answering lead, and remove layers gradually in the outro.',
    'Check that kick and bass accents cooperate, the backbeat remains audible, and the chorus has an actual melodic answer. Short pattern repetition alone cannot prove musical quality.'
  ]],
  ['Trap','트랩',140,[
    'Use a half-time phrase at the fast notated tempo. A sparse intro should expose a motif before bass enters; a bridge should change register or remove the main bass response.',
    'Choose a minor pentatonic pitch family for a compact pluck hook. Keep the bass in a low register and use a different bass pattern for the contrasting section.',
    'For half-time feel put the snare near zero-based beat 2 of a four-beat bar. Use a few close hat attacks and quieter secondary hits. With six-note patterns, write a separate hat pattern if needed.',
    'A two-bar melodic phrase can anticipate the downbeat then rest. Answer the first phrase with a changed last note instead of transposing every voice arbitrarily.',
    'Separate low bass, plucked lead and hat/snare roles; no single pattern should be played by all three. Remove hats in a breakdown and bring the hook back with a new answer.',
    'The current note schema cannot represent continuous 808 slides or filter automation. Judge the bass rhythm and pitch contour; do not claim these production techniques were synthesised.'
  ]],
  ['R&B / Soul','알앤비 소울',92,[
    'Start with a restrained chord and melody dialogue. The chorus should extend the theme with a higher answer while the bridge briefly changes bass direction and harmonic colour.',
    'Use thirds and sevenths to imply a chord rather than crowding all extensions at once. Move common tones smoothly between phrases; keep the lowest chord voice above the bass.',
    'Use a laid-back backbeat and syncopated bass entry, with softer intermediate percussion. Leave space after strong melodic attacks so the rhythm breathes.',
    'Shape an original lyrical motif with a small rise, a held note and a downward answer. Write a second pattern that resolves differently rather than using six random scale tones.',
    'Piano or organ may carry sustained chord tones, guitar a quiet response, and bass an independent line. Vary gain and register between sections without stacking every layer.',
    'Inspect sustained chord pitch relations and bass register. Extended harmony is not established by a genre label; verify actual simultaneous thirds/sevenths and directed resolution.'
  ]],
  ['Pop','팝',118,[
    'Write a distinctive short hook that returns in the chorus. The verse should foreshadow it with less density; the bridge should create a contrast before the final resolution.',
    'Choose a coherent diatonic chord cycle, such as tonic to predominant to dominant to tonic, and connect the bass to the intended roots. Do not choose unrelated transpositions per instrument.',
    'Use a clear pulse and backbeat. The chorus may add brighter subdivision while the verse keeps space. Give the bass and hook complementary attack positions.',
    'Make the hook singable as instrumental melody: small intervals with one purposeful leap, repeated rhythmic identity and a changed ending in its answer.',
    'Pair guitar or piano accompaniment with synth lead and low bass; strengthen the chorus with a melodic response, not only louder gain. Finish with a deliberate tonic arrival.',
    'Check hook recurrence, verse/chorus melodic difference, and final pitch stability. Five named sections with identical notes do not constitute a developed pop song.'
  ]],
  ['Rock','록',132,[
    'Expose a recognisable guitar riff in the intro, answer it in the verse, and open the chorus register. Use a quieter bridge or rhythmic stop before a purposeful ending.',
    'Compose a tonal riff built around roots/fifths and one contrasting note. Give bass its own rhythmic support rather than applying arbitrary semitone transpositions to the guitar line.',
    'Use kick/snare backbeat with clear accents and a short fill near a transition. A six-note drum motif is sparse; prefer strong essential hits rather than pretending to recreate a detailed live kit.',
    'Change the riff ending or rhythmic pickup for the chorus. Avoid endlessly replaying a one-bar scale fragment with only an instrument change.',
    'Keep guitar, bass and lead roles separate. Contrast a single guitar intro, fuller ensemble chorus and thinner bridge; choose a strong final sustained note or chord.',
    'The preview synth does not produce authentic distorted guitar performance. Evaluate riff, harmony and arrangement separately from recording realism.'
  ]],
  ['Funk','펑크',108,[
    'A tight repeating groove can anchor the song, but write contrasting two-bar bass and chord answers. Use a break that removes the lead and highlights the rhythm section.',
    'Use a compact dominant or minor chord colour with short chord stabs. Keep chord notes out of the bass register and make a response phrase return to a stable chord tone.',
    'Write interlocking syncopations: bass accents some gaps in guitar/organ stabs rather than duplicating every attack. A few displaced sixteenth notes can define a compact motif.',
    'A short brass or synth question should receive a different rhythmic answer. Preserve rests; continuous notes can erase the groove’s interaction.',
    'Use low bass, short guitar/organ stabs and a restrained brass response. Let a chorus combine answers, then thin the bridge so the final return gains contrast.',
    'Check offbeat attacks, note gates and complementary bass/chord rhythm. Labelled slap bass or wah effects are not supported by the current symbolic renderer.'
  ]],
  ['Jazz','재즈',116,[
    'Treat the opening melody as a head and the middle as a varied response. Develop its rhythm or interval ending before returning to a recognisable closing statement.',
    'Connect guide tones in close motion: a chord third or seventh should move purposefully into the next chord tone. Use bass roots below sparse upper voicings.',
    'Express swing with unequal fractional beat spacing rather than assuming a swing parameter exists. Keep bass pulse independent from occasional soft ride or rim accents.',
    'Compose a small motif with a chromatic approach resolving into a chord tone, then vary the answer. Do not copy a standard melody or call random chromatic pitches jazz.',
    'Piano, bass and a brass-like melodic voice can dialogue. Leave room after phrases; change the instrumental lead or register in the bridge while retaining harmonic continuity.',
    'Verify actual voice leading and motif development. A seventh chord label, warm timbre or many repeated notes is insufficient evidence of jazz composition quality.'
  ]],
  ['House','하우스',124,[
    'Build energy through a restrained intro, groove statement, melodic peak, breakdown and return/outro. At 120 seconds keep transitions concise instead of copying a long DJ arrangement.',
    'Use a stable minor or major chord family and a rolling bass line whose root changes remain coherent. Give the piano or synth hook a separate response pattern.',
    'A four-on-the-floor drum pattern should contain kick pitches 36 at beats 0,1,2,3 of a four-beat bar; the remaining notes can be clap/hat accents. Use a second drum pattern for a fill.',
    'A memorable melodic cell should recur with an altered ending or register in the peak. Preserve rhythmic identity while changing accompaniment density.',
    'Keep kick and bass centred, chords modestly spread, and remove percussion or bass during the breakdown. Reinstate the hook with a contrasting chord or answering line.',
    'Inspect quarter-note kick coverage and breakdown contrast in actual notes. Audio-side pumping/sidechain and filter sweeps are not encoded by this score format.'
  ]],
  ['Techno','테크노',132,[
    'Use a focused ostinato and tension arc. A sparse introduction, denser groove, stripped break and final release should be audible through notes, density and register.',
    'A modal or single-root palette can work, but make deliberate interval choices. Avoid unrelated sustained transpositions that generate accidental harmonic collisions.',
    'Use regular quarter-note kicks for the main groove, then create a second percussion motif with a different accent pattern. Keep the ostinato’s displaced attacks distinct from the kick.',
    'Vary the ostinato by a changed final note, octave answer or rhythmic shift in a new motif. Repeating one pattern for two minutes with unchanged arrangement is only a loop study.',
    'Limit the ensemble to a few roles: kick/percussion, low bass, a focused synth sequence and an occasional pad. Increase and decrease layers deliberately at section boundaries.',
    'The current renderer cannot model evolving modular synthesis. Assess rhythmic structure and thematic changes without crediting absent automation or sound design.'
  ]],
  ['Drum & Bass','드럼앤베이스',172,[
    'At fast tempo, let the melodic phrase and bass breathe in half-time. Build from a light intro into a broken-beat section, contrasting bridge and a clear final release.',
    'A smooth minor palette can connect a sparse pad/chord line to an independent sub-bass motif. Avoid very low chord voicings that compete with the bass.',
    'Use broken kick placements and snares around beats 1 and 3 of a four-beat bar. With at most six notes in a motif, concentrate on the defining backbeat; use another motif for variation.',
    'Write a longer-feeling melodic contour with held notes above the fast drum grid, then answer it with a changed ending. Fast repeated scale notes alone do not create liquid phrasing.',
    'Bass, pad/piano and melodic lead should have separate patterns. Drop some percussion in the bridge and change the bass response when the main motif returns.',
    'Check fast BPM, broken kick placement and backbeat. Detailed sampled breaks, continuous sub modulation and real mix quality are outside the preview renderer.'
  ]],
  ['Ambient','앰비언트',60,[
    'Create an opening, gradual development, central texture, contrasting colour and resolved ending without imposing a pop backbeat. The five stored section names are technical markers.',
    'Use a small stable pitch family with slowly changing upper chord tones over a quiet low anchor. Avoid unrelated dense sustained chords that cause uncontrolled dissonance.',
    'Prefer sparse long notes and rests to a drum loop. A two-bar pattern at slow tempo can sustain several tones with staggered arrivals; changing voice entries supplies movement.',
    'Use a modest contour in piano or bell and a separate quieter answer. Repeating identical six-note phrases at equal gain does not create evolving texture.',
    'Use pad/strings with a restrained piano or bell voice. Shift register, gain and instrumentation deliberately at boundaries, leaving room for the existing instrument releases.',
    'Check absence of compulsory drums, long-note balance and section contrast. Reverb, granular textures and evolving effects are not generated by the current score engine.'
  ]],
  ['Cinematic','시네마틱',88,[
    'Shape a narrative arc: expose a small theme, develop its answer, reach a larger statement, offer a quieter contrast and resolve the opening idea at the end.',
    'Keep a coherent tonal anchor while moving upper voices smoothly. Use a stable pedal selectively, then move the bass at the peak to create harmonic development.',
    'Let long phrases lead the pacing. Percussion should underline key arrivals rather than cover every beat; the bridge can remove it for contrast.',
    'Develop one original interval cell by changed contour, register and cadence. A high brass doubling of every string note is not independent thematic development.',
    'Use strings, piano and restrained brass roles, growing density toward the central statement. Balance sustained voices so the renderer’s voice budget is respected.',
    'Check theme recurrence with variation, register growth and a deliberate ending. Orchestral recording realism is separate from the symbolic narrative structure.'
  ]],
  ['Acoustic / Folk','어쿠스틱 포크',96,[
    'Use a simple original tune with question/answer phrases. Start with plucked accompaniment, develop a second melodic answer and finish with a quieter return.',
    'Use a coherent diatonic root movement and place guitar accompaniment above an independent low bass or cello-like string line. Avoid crowding accompaniment into the low register.',
    'Imply fingerstyle through alternating low and upper attacks in a guitar pattern. Soft shaker accents may support the pulse; do not force a heavy electronic backbeat.',
    'A tune should have small intervals, purposeful phrase peaks and a resolving answer. Create a contrasting motif instead of adding unrelated scale pitches.',
    'Guitar and a restrained piano or strings voice can alternate leads; keep the bridge thin and close with a stable final chord tone. Use gain changes as phrasing, not a volume race.',
    'The renderer uses synthesized plucks, not a recorded fingerstyle guitarist. Inspect melody, accompaniment independence and cadence separately from natural timbre.'
  ]],
  ['Classical','클래식',84,[
    'Present a theme, develop its interval or rhythmic identity, create a contrasting middle and bring back an altered answer before the cadence. Stored pop-like names are section markers only.',
    'Use controlled voice leading: common tones stay where possible, other voices move to nearby intended chord tones. Plan a dominant-to-tonic or similarly deliberate final arrival.',
    'Phrase accents should follow melodic grouping and harmonic arrival rather than a mandatory drum backbeat. Use varied durations and rests within the four-beat score grid.',
    'Develop a short original theme by sequence, rhythmic change or a new ending. Distinguish motif development from copying the same one-bar phrase through every section.',
    'Piano and strings can take independent roles and exchange lead. Spread chord registers, keep low voices clear, and thin the middle before the final thematic return.',
    'The current engine supports 4/4 and six-note motifs only; it cannot establish advanced counterpoint or long-form classical quality merely by naming the genre.'
  ]],
  ['Latin','라틴',104,[
    'Choose one specific Latin-inspired rhythmic direction for this sketch instead of claiming all Latin traditions. Let a guitar phrase and rhythmic bass answer alternate before a fuller central section.',
    'Use a stable tonal chord family and bass roots with purposeful anticipations. Guitar chord tones should remain above the bass, and the melodic answer should resolve to an intended harmony.',
    'Create an asymmetric percussion accent motif, such as a two-bar 3+2-inspired grouping, using supported rim/shaker pitches. Avoid presenting a generic straight backbeat as authentic clave.',
    'Let the melody enter across an accent and leave a rest for the rhythmic answer. Change the last interval or pickup in a new motif to develop the phrase.',
    'Guitar, low bass, piano or brass response and restrained percussion can interlock. Remove one response in the bridge, then return with a clear harmonic ending.',
    'The supported drum map has no real conga/bongo samples. Assess syncopation and ensemble interaction, and describe the output as Latin-inspired rather than culturally complete.'
  ]],
  ['Reggae / Dub','레게 덥',76,[
    'Use a relaxed groove with short chord responses and space for bass. A thinner bridge should expose the bass before the final return and gradual outro.',
    'Use a stable diatonic or minor chord family; let a low bass motif carry a clear root movement and separate melodic answer. Do not move chord and bass pitches randomly.',
    'Place short guitar or organ chord attacks on offbeats such as 0.5,1.5,2.5,3.5 within a four-beat bar. Use sparse percussion and space around a one-drop-inspired central accent.',
    'A small original hook should answer the bass or chord rhythm rather than fill every gap. Write a distinct response pattern with a different final note.',
    'Low centred bass and offbeat guitar/organ should be separate patterns. Remove lead or percussion during the bridge and keep the outro sparse and resolved.',
    'Tape delay feedback and dub mixing are not encoded by this renderer. Verify offbeat note positions, sparse bass space and arrangement contrast before judging style.'
  ]],
];
const aspects = ['Form','Harmony','Groove','Melody','Arrangement','Evaluation'];
export const GENRE_GUIDANCE = rows.map(([genre,korean,bpm,notes]) => ({ genre,korean,bpm,notes }));
export const COMPOSITION_CORPUS = rows.flatMap(([genre,korean,,notes]) => notes.map((content,index) => ({
  title: `${genre}: ${aspects[index]}`, content, tags: `${genre}|${korean}|${aspects[index]}`,
  source: 'Soundry 독자 작성 작곡 설계 v1; 기존 곡·악보 미사용', rights: 'own' as const, allowRemote: false,
})));
