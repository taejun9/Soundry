import { describe, expect, it } from 'vitest';
import type { Composition } from './schema.js';
import { compositionMidi } from './midi.js';
// Independent binary reader checks timing/channel semantics rather than repeating exporter loops.
function readMidi(data: Buffer) {
  expect(data.subarray(0,4).toString()).toBe('MThd'); expect(data.readUInt32BE(4)).toBe(6);
  const tracks: { tick: number; status: number; payload: number[] }[][] = [];
  let offset = 14;
  while (offset < data.length) {
    expect(data.subarray(offset,offset+4).toString()).toBe('MTrk'); const finish = offset + 8 + data.readUInt32BE(offset+4); offset += 8;
    let tick = 0; const events: typeof tracks[number] = [];
    const vlq = () => { let value = 0; let byte: number; do { byte = data[offset++]!; value = value * 128 + (byte & 127); } while (byte & 128); return value; };
    while (offset < finish) { tick += vlq(); const status = data[offset++]!;
      const kind = status === 255 ? data[offset++]! : undefined;
      const length = status === 255 ? vlq() : status >> 4 === 12 ? 1 : 2;
      const payload = [...data.subarray(offset,offset+length)]; offset += length;
      events.push({ tick,status,payload: kind === undefined ? payload : [kind,...payload] });
    }
    expect(offset).toBe(finish); tracks.push(events);
  }
  expect(tracks).toHaveLength(data.readUInt16BE(10)); return tracks;
}
const score: Composition = { version: 1,bpm:120,genre:'original',mood:'calm',seed:'qa',sections:[{name:'intro',startBar:0,bars:1}],patterns:[{id:'p',bars:1,notes:[{beat:0,pitch:60,duration:3,velocity:1}]}],parts:[{instrument:'piano',patternId:'p',startBar:0,repeats:2,transpose:0,gain:0.5,pan:0},{instrument:'drums',patternId:'p',startBar:0,repeats:1,transpose:0,gain:1,pan:0}] };
describe('symbolic MIDI export', () => {
  it('writes standard type 1, tempo and markers, clips the ending and reserves drum channel 10', () => {
    const data = compositionMidi(score,1); const tracks = readMidi(data);
    expect(data.readUInt16BE(8)).toBe(1); expect(data.readUInt16BE(12)).toBe(480);
    expect(tracks[0]).toContainEqual({ tick:0,status:255,payload:[0x51,7,161,32] });
    expect(tracks[0]).toContainEqual({ tick:0,status:255,payload:[0x06,...Buffer.from('intro')] });
    expect(tracks[1]).toContainEqual({ tick:0,status:0x90,payload:[60,64] });
    expect(tracks[1]).toContainEqual({ tick:960,status:0x80,payload:[60,0] });
    expect(tracks[2]).toContainEqual({ tick:0,status:0x99,payload:[60,127] });
    expect(tracks.flat().every(e => e.tick <= 960)).toBe(true);
    expect(tracks.every(t => t.at(-1)?.payload[0] === 0x2f)).toBe(true);
  });
  it('places note-off before retrigger and applies transposition', () => {
    const single = { ...score,patterns:[{id:'p',bars:1,notes:[{beat:0,pitch:60,duration:4,velocity:0.8}]}],parts:[{...score.parts[0]!,transpose:2,repeats:2}] };
    const events = readMidi(compositionMidi(single,4))[1]!;
    expect(events.filter(e => e.tick === 1920).map(e => e.status)).toEqual([0x80,0x90]);
    expect(events.find(e => e.status === 0x90)!.payload[0]).toBe(62);
  });
  it('holds overlapping same-pitch gates until the last voice ends', () => {
    const layered = { ...score, patterns: [{ id: 'p', bars: 1, notes: [{ beat: 0, pitch: 60, duration: 8, velocity: 1 }] }], parts: [{ ...score.parts[0]!, repeats: 1 }, { ...score.parts[0]!, startBar: 1, repeats: 1 }] };
    const events = readMidi(compositionMidi(layered,6))[1]!;
    expect(events.filter(e => e.status === 0x90)).toHaveLength(1);
    expect(events.filter(e => e.status === 0x80)).toEqual([{ tick: 5760, status: 0x80, payload: [60,0] }]);
  });
});
