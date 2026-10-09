import { describe, expect, it } from 'vitest';
import type { Arrangement, ArrangementClip } from '../../../../shared/contracts';
import { ArrangementHistory, snapTime, splitClip, launcherArrangement } from './studio';
import { exportHeadroom, fadeAt, validateMix } from './mix';
import { audibleClips } from './arrangement';
const clip: ArrangementClip = { id: 'c', trackId: 't', label: 'A', start: 2, offset: 3, duration: 4, volume: 0.8, loop: false, fadeIn: 1, fadeOut: 1 };
const value: Arrangement = { duration: 10, lanes: [{ id: 'l', name: 'L', muted: false, clips: [clip] }] };
describe('production editing and signal contracts', () => {
  it('splits without gaps or losing the source position or boundary fades', () => {
    const [left, right] = splitClip(clip, 4, 'new')!;
    expect(left.start + left.duration).toBe(right.start);
    expect(left.offset + left.duration).toBe(right.offset);
    expect(right.start + right.duration).toBe(clip.start + clip.duration);
    expect([left.fadeIn, left.fadeOut, right.fadeIn, right.fadeOut]).toEqual([1,0,0,1]);
    expect(clip.duration).toBe(4);
    for (const at of [2,6,NaN,1]) expect(splitClip(clip, at, 'new')).toBeNull();
    expect(splitClip({...clip, loop:true},4,'new')).toBeNull();
  });
  it('snaps to musical beats and allows unsnapped timing', () => {
    expect(snapTime(1.26,120,1)).toBe(1.5);
    expect(snapTime(1.26,120,0.25)).toBe(1.25);
    expect(snapTime(1.26,120,0)).toBe(1.26);
  });
  it('preserves saved edits, limits history and invalidates redo after a divergent edit', () => {
    const h=new ArrangementHistory(2); h.reset(value);
    h.record({...value,bpm:100}); h.record({...value,bpm:110}); h.record({...value,bpm:120});
    expect(h.undo()?.bpm).toBe(110); expect(h.undo()?.bpm).toBe(100); expect(h.undo()).toBeNull();
    expect(h.redo()?.bpm).toBe(110); h.record({...value,bpm:130}); expect(h.redo()).toBeNull();
    const old=h.undo()!; old.lanes[0]!.clips[0]!.offset=999;
    expect(h.redo()?.lanes[0]?.clips[0]?.offset).toBe(3);
  });
  it('launches a scene without changing saved arrangement positions and respects mute and solo', () => {
    const a={...value,lanes:[...value.lanes,{id:'b',name:'B',muted:false,solo:true,clips:[{...clip,id:'b',start:5}]}]};
    const launched=launcherArrangement(a,0);
    expect(launched.lanes.map(l=>l.clips[0]?.start)).toEqual([0,0]);
    expect(a.lanes.map(l=>l.clips[0]?.start)).toEqual([2,5]);
    expect(audibleClips(launched).map(c=>c.id)).toEqual(['b']);
    expect(audibleClips({...a,lanes:a.lanes.map(l=>({...l,muted:l.id==='b'}))})).toEqual([]);
    expect(launcherArrangement(a,0,'b').lanes[0]?.clips).toEqual([]);
  });
  it('resumes at the correct fade amplitude and rejects invalid mixer/fade/source inputs before scheduling', () => {
    expect([0,0.5,2,3.5,4].map(at=>fadeAt(clip,at))).toEqual([0,0.5,1,0.5,0]);
    const buffers=new Map([['t',{duration:10} as AudioBuffer]]);
    expect(()=>validateMix(value,buffers)).not.toThrow();
    for(const bad of [{...value,masterVolume:NaN},{...value,lanes:[{...value.lanes[0]!,pan:2}]},{...value,lanes:[{...value.lanes[0]!,delaySeconds:3}]},{...value,lanes:[{...value.lanes[0]!,clips:[{...clip,fadeIn:3,fadeOut:2}]}]}]) expect(()=>validateMix(bad,buffers)).toThrow();
    expect(()=>validateMix(value,new Map())).toThrow('PREVIEW_SIZE');
  });
  it('attenuates both channels equally for headroom without boosting quieter mixes', () => {
    const samples=[new Float32Array([1.3,-1.3]),new Float32Array([0.65,-0.65])];
    const buffer={numberOfChannels:2,getChannelData:(c:number)=>samples[c]} as AudioBuffer;
    const result=exportHeadroom(buffer);
    expect(result.peakDbfs).toBeCloseTo(-1); expect(result.attenuationDb).toBeLessThan(0);
    expect(samples[0]![0]!/samples[1]![0]!).toBeCloseTo(2);
    const before=Array.from(samples[0]!); expect(exportHeadroom(buffer).attenuationDb).toBeCloseTo(0); expect(Array.from(samples[0]!)).toEqual(before);
    expect(()=>exportHeadroom({numberOfChannels:1,getChannelData:()=>new Float32Array([NaN])} as unknown as AudioBuffer)).toThrow('NONFINITE_AUDIO');
  });
});
