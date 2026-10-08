import type { Composition, Instrument } from './schema.js';
const PPQ = 480;
const programs: Record<Instrument, number> = { piano: 0, bass: 33, synth: 80, guitar: 24, strings: 48, brass: 61, organ: 16, bell: 10, pad: 89, drums: 0 };
function variable(value: number): number[] {
  const result = [value & 127];
  while ((value = Math.floor(value / 128)) > 0) result.unshift((value & 127) | 128);
  return result;
}
function chunk(name: string, data: Buffer): Buffer { const size = Buffer.alloc(4); size.writeUInt32BE(data.length); return Buffer.concat([Buffer.from(name), size, data]); }
type Event = { tick: number; bytes: number[]; priority: number };
function track(events: Event[], end: number): Buffer {
  events.sort((a,b) => a.tick - b.tick || a.priority - b.priority);
  let previous = 0; const bytes: number[] = [];
  for (const event of events) { bytes.push(...variable(event.tick - previous), ...event.bytes); previous = event.tick; }
  bytes.push(...variable(Math.max(0,end - previous)),0xff,0x2f,0);
  return chunk('MTrk', Buffer.from(bytes));
}
function meta(tick: number, kind: number, data: Buffer): Event { return { tick, bytes: [0xff,kind,...variable(data.length),...data], priority: 0 }; }
// Export only validated symbolic composition; MIDI instrument timbres depend on the user's DAW.
export function compositionMidi(score: Composition, durationSeconds: number): Buffer {
  const end = Math.round(durationSeconds * score.bpm / 60 * PPQ);
  const tempo = Buffer.alloc(3); tempo.writeUIntBE(Math.round(60_000_000 / score.bpm),0,3);
  const conductor = [meta(0,0x51,tempo),meta(0,0x58,Buffer.from([4,2,24,8]))];
  for (const section of score.sections) conductor.push(meta(section.startBar * 4 * PPQ,0x06,Buffer.from(section.name)));
  const instruments = [...new Set(score.parts.map(part => part.instrument))];
  const chunks = [track(conductor,end)];
  let melodicChannel = 0;
  for (const instrument of instruments) {
    if (melodicChannel === 9) melodicChannel++;
    const channel = instrument === 'drums' ? 9 : melodicChannel++;
    const events: Event[] = [meta(0,0x03,Buffer.from(instrument)), { tick: 0,bytes: [0xc0 | channel, programs[instrument]],priority: 0 }];
    for (const part of score.parts.filter(p => p.instrument === instrument)) {
      const pattern = score.patterns.find(p => p.id === part.patternId)!;
      for (let repeat = 0; repeat < part.repeats; repeat++) for (const note of pattern.notes) {
        const start = Math.round(((part.startBar + repeat * pattern.bars) * 4 + note.beat) * PPQ);
        if (start >= end) continue;
        const stop = Math.min(end,Math.max(start + 1,Math.round(start + note.duration * PPQ)));
        const pitch = note.pitch + part.transpose;
        const velocity = Math.max(1, Math.min(127,Math.round(note.velocity * part.gain * 127)));
        // Per-note gain preserves layered part dynamics without a shared channel-volume overwrite.
        events.push({ tick: start,bytes: [0x90 | channel,pitch,velocity],priority: 2 }, { tick: stop,bytes: [0x80 | channel,pitch,0],priority: 1 });
      }
    }
    events.sort((a,b) => a.tick - b.tick || a.priority - b.priority);
    const held = new Map<number,number>(); const merged: Event[] = [];
    for (const event of events) {
      const type = event.bytes[0]! >> 4;
      if (type === 9 || type === 8) {
        const pitch = event.bytes[1]!; const count = held.get(pitch) ?? 0;
        if (type === 9) { held.set(pitch,count+1); if (count === 0) merged.push(event); }
        else { held.set(pitch,Math.max(0,count-1)); if (count === 1) merged.push(event); }
      } else merged.push(event);
    }
    chunks.push(track(merged,end));
  }
  const header = Buffer.alloc(6); header.writeUInt16BE(1,0); header.writeUInt16BE(chunks.length,2); header.writeUInt16BE(PPQ,4);
  return Buffer.concat([chunk('MThd',header),...chunks]);
}
