import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { LlamaCppRunner } from './llamacpp-runner.js';
import { ProviderService, readMusicProvider } from './provider.service.js';
import { llamaCompositionSchema } from './composition/llamacpp-schema.js';
import { parseComposition } from './composition/index.js';
import { CLI_OUTPUT_LIMIT } from './cli-runner.js';
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
async function server(options: { health?: string; models?: unknown; output?: string; pending?: boolean; redirect?: boolean; respond?: (body: Record<string,unknown>)=>unknown } = {}) {
  const calls: { path: string; body: Record<string,unknown> }[] = [];
  const instance = createServer(async (req,res) => {
    let data = ''; for await (const chunk of req) data += chunk;
    calls.push({ path: req.url!,body:data ? JSON.parse(data) : {} }); res.setHeader('Content-Type','application/json');
    if (req.url === '/health') res.end(JSON.stringify({ status: options.health ?? 'ok' }));
    else if (req.url === '/v1/models') res.end(JSON.stringify(options.models ?? { data: [{ id: '/private/models/gemma-Q4.gguf' }] }));
    else if (options.redirect) { res.statusCode = 302;res.setHeader('Location','http://127.0.0.1:1/private');res.end(); }
    else if (!options.pending) res.end(options.output ?? JSON.stringify(options.respond?.(calls.at(-1)!.body) ?? { choices: [{ finish_reason: 'stop',message: { role: 'assistant',content: '{"version":1}' } }] }));
  }); servers.push(instance); await new Promise<void>(resolve => instance.listen(0,'127.0.0.1',resolve));
  return { calls,port:String((instance.address() as AddressInfo).port) };
}
const signal = () => new AbortController().signal;
describe('llama.cpp local composition contract', () => {
  it('discovers the loaded model and sends constrained JSON without tools/thinking, with safe provenance', async () => {
    const models={data:[{id:'/private/models/gemma-Q4.gguf'}]};const s=await server({models});const runner=new LlamaCppRunner({port:s.port});
    expect(readMusicProvider('llamacpp')).toBe('llamacpp');expect(new ProviderService('llamacpp').summary()).toMatchObject({id:'llamacpp',isMock:false,configured:false});
    expect(await runner.probe(signal())).toBe('ready');expect(runner.modelLabel).toBe('llamacpp:gemma-Q4.gguf:sectional-v2');
    const schema={type:'object'};expect(await runner.compose('original music',schema,signal())).toEqual({version:1});
    expect(s.calls.at(-1)!.body).toMatchObject({model:'/private/models/gemma-Q4.gguf',response_format:{type:'json_object',schema},stream:false,reasoning_effort:'none',chat_template_kwargs:{enable_thinking:false}});
    expect(s.calls.at(-1)!.body).not.toHaveProperty('tools');expect(runner.modelLabel).not.toContain('/private'); expect(runner.compositionModelLabel).toBe('llamacpp:gemma-Q4.gguf:sectional-v2');
    models.data[0]!.id='/private/models/next.gguf';await runner.probe(signal());expect(runner.modelLabel).toBe('llamacpp:next.gguf:sectional-v2');expect(runner.compositionModelLabel).toBe('llamacpp:gemma-Q4.gguf:sectional-v2');
  });
  it('rejects unready/ambiguous/remote models before sending musical input', async () => {
    for (const options of [{health:'loading'}, {models:{data:[]}}, {models:{data:[{id:'a'},{id:'b'}]}}, {models:{data:[{id:'a',remote_host:'https://private.test'}]}}, {models:{data:[{id:'a',status:{value:'unloaded'}}]}}]) {
      const s=await server(options);await expect(new LlamaCppRunner({port:s.port}).compose('private reference',{},signal())).rejects.toBeDefined();
      expect(s.calls.some(c=>c.path==='/v1/chat/completions')).toBe(false);
    }
  });
  it('rejects arbitrary endpoints and incomplete/tool/markdown output', async () => {
    for (const port of ['80','65536','http://example.test','8089/path']) expect(()=>new LlamaCppRunner({port})).toThrow('INVALID_LLAMA_PORT');
    for (const choice of [{finish_reason:'length',message:{role:'assistant',content:'{}'}},{finish_reason:'stop',message:{role:'assistant',content:'```json {} ```'}},{finish_reason:'stop',message:{role:'assistant',content:'{}',tool_calls:[{}]}}]) {
      const s=await server({output:JSON.stringify({choices:[choice]})});await expect(new LlamaCppRunner({port:s.port}).compose('music',{},signal())).rejects.toMatchObject({code:'LOCAL_INVALID_OUTPUT'});
    }
  });
  it('bounds bytes and blocks redirects while preserving cancellation/timeout', async () => {
    const large=await server({output:'x'.repeat(CLI_OUTPUT_LIMIT+1)});await expect(new LlamaCppRunner({port:large.port}).compose('music',{},signal())).rejects.toMatchObject({code:'LOCAL_OUTPUT_TOO_LARGE'});
    const redirect=await server({redirect:true});await expect(new LlamaCppRunner({port:redirect.port}).compose('music',{},signal())).rejects.toMatchObject({code:'LOCAL_UNAVAILABLE'});
    const pending=await server({pending:true});const controller=new AbortController();const call=new LlamaCppRunner({port:pending.port}).compose('music',{},controller.signal);setTimeout(()=>controller.abort(),30);await expect(call).rejects.toMatchObject({name:'AbortError'});
    await expect(new LlamaCppRunner({port:pending.port,timeoutMs:30}).compose('music',{},signal())).rejects.toMatchObject({code:'LOCAL_TIMEOUT'});
  });
  it('writes six expressive sections through seven compact calls with real chords and exact boundaries',async()=>{
    const input={prompt:'House four-on-the-floor drums',settings:{bpm:120,durationSeconds:120,genre:'House',mood:'warm',seed:'original'},variationCount:1};
    let stage=0;
    const respond=(body:Record<string,unknown>)=>{
      const schema=(body.response_format as {schema:{properties:Record<string,unknown>}}).schema;
      const output=schema.properties.tonic?tonalPlan:wirePhrase(Object.keys(schema.properties).length,true,stage++,schema.properties);
      return {choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]};
    };
    const s=await server({respond});const score=parseComposition(await new LlamaCppRunner({port:s.port}).compose('original',llamaCompositionSchema(input),signal()),input);
    expect(score.patterns).toHaveLength(24);expect(score.sections.map(row=>row.name)).toEqual(['intro','verse','chorus','bridge','chorus','outro']);
    expect(score.patterns.reduce((sum,p)=>sum+p.notes.length,0)).toBeGreaterThan(300);
    for(const part of score.parts) {const row=score.sections.find(row=>row.startBar===part.startBar)!;const p=score.patterns.find(p=>p.id===part.patternId)!;expect(part.startBar+p.bars*part.repeats).toBe(row.startBar+row.bars);}
    expect(s.calls.filter(c=>c.path==='/v1/chat/completions')).toHaveLength(7);
    expect(s.calls.filter(c=>c.path==='/v1/chat/completions').every(c=>!('tools' in c.body)&&c.body.max_tokens===8192)).toBe(true);
  });
  it('does not invent percussion for an explicitly drumless brief and bounds semantic repair',async()=>{
    const input={prompt:'Ambient without drums',settings:{bpm:60,durationSeconds:120,genre:'Ambient',mood:'calm',seed:'original'},variationCount:1};
    for(const mode of ['valid','out-of-bar','bad-chords','duplicate','missing-layer']) {
      let phrases=0;
      const respond=(body:Record<string,unknown>)=>{
        const schema=(body.response_format as {schema:{properties:Record<string,unknown>}}).schema;
        const output=schema.properties.tonic?tonalPlan:wirePhrase(Object.keys(schema.properties).length,false,phrases++,schema.properties);
        if(!schema.properties.tonic) {
          const phrase=output as ReturnType<typeof wirePhrase>;
          if(mode==='out-of-bar')phrase.bar0!.lead[0]!.timing[1]=999;
          if(mode==='bad-chords')for(const row of phrase.bar0!.chords)row.voices=[61,65,68];
          if(mode==='duplicate')phrase.bar0!.lead[1]=structuredClone(phrase.bar0!.lead[0]!);
          if(mode==='missing-layer')delete (phrase.bar0 as Partial<typeof phrase.bar0>).bass;
          expect((schema.properties.bar0 as {properties:object}).properties).not.toHaveProperty('drums');
        }
        return {choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]};
      };
      const s=await server({respond});const call=new LlamaCppRunner({port:s.port}).compose('original',llamaCompositionSchema(input),signal());
      if(mode==='valid'){const score=parseComposition(await call,input);expect(score.parts.some(p=>p.instrument==='drums')).toBe(false);expect(phrases).toBe(6);}
      else {await expect(call).rejects.toMatchObject({code:'LOCAL_INVALID_OUTPUT'});expect(phrases).toBe(2);}
    }
  });
  it('requires a model-written diatonic answer in the one repair of a three-pitch candidate',async()=>{
    const input={prompt:'Original Pop drums',settings:{bpm:120,durationSeconds:120,genre:'Pop',seed:'answer'},variationCount:1};let phrases=0,answerGrammarSeen=false;
    const respond=(body:Record<string,unknown>)=>{
      const schema=(body.response_format as {schema:{properties:Record<string,unknown>}}).schema;
      const output=schema.properties.tonic?tonalPlan:wirePhrase(Object.keys(schema.properties).length,true,phrases++,schema.properties);
      if(!schema.properties.tonic){const phrase=output as ReturnType<typeof wirePhrase>;
        if(phrases===1)for(const row of Object.values(phrase))row.lead.forEach((n,i)=>n.pitch=[60,64,67][i%3]!);
        const last='bar'+(Object.keys(schema.properties).length-1);const lead=(schema.properties[last] as {properties:{lead:{prefixItems?:{properties:{pitch:{enum:number[]}}}[]}}}).properties.lead;
        if(lead.prefixItems){const pitches=lead.prefixItems[3]!.properties.pitch.enum;expect(pitches.every(p=>![60,64,67].includes(p))).toBe(true);expect(pitches.every(p=>[0,2,4,5,7,9,11].includes(p%12))).toBe(true);phrase[last]!.lead.push({timing:[42,3],pitch:pitches[0]!,velocity:70});answerGrammarSeen=true;}
      }
      return {choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]};
    };
    const s=await server({respond});const score=parseComposition(await new LlamaCppRunner({port:s.port}).compose('original',llamaCompositionSchema(input),signal()),input);
    expect(answerGrammarSeen).toBe(true);expect(phrases).toBe(7);expect(score.patterns).toHaveLength(24);
  });
  it('repairs one invalid phrase without copying a previous song or bypassing strict validation',async()=>{
    const input={prompt:'Pop drums',settings:{bpm:118,durationSeconds:120,genre:'Pop',mood:'bright',seed:'original'},variationCount:1};let phrases=0;
    const respond=(body:Record<string,unknown>)=>{
      const schema=(body.response_format as {schema:{properties:Record<string,unknown>}}).schema;
      const output=schema.properties.tonic?tonalPlan:wirePhrase(Object.keys(schema.properties).length,true,phrases++,schema.properties);
      if(!schema.properties.tonic&&phrases===1)(output as ReturnType<typeof wirePhrase>).bar0!.lead[0]!.timing[1]=999;
      return {choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]};
    };
    const s=await server({respond});const score=parseComposition(await new LlamaCppRunner({port:s.port}).compose('original',llamaCompositionSchema(input),signal()),input);
    expect(score.parts).toHaveLength(24);expect(phrases).toBe(7);expect(s.calls.filter(c=>c.path==='/v1/chat/completions')).toHaveLength(8);
  });
});
const tonalPlan={tonic:0,mode:'major',verse:[1,4,5,6,2,4,5,1],chorus:[1,4,5,6,2,4,5,1],bridge:[1,4,5,6,2,4,5,1],leadInstrument:'piano',chordInstrument:'strings'};
function phraseFixture(bars:number,drums:boolean,stage:number) {
  const lead:number[][]=[],chords:number[][]=[],bass:number[][]=[],rhythm:number[][]=[];const scale=[0,2,4,5,7,9,11];
  for(let bar=0;bar<bars;bar++) {
    const degree=tonalPlan.verse[bar%8]!-1;const pcs=[0,2,4].map(offset=>scale[(degree+offset)%7]!);
    for(const tick of [0,8]) {for(const pc of pcs)chords.push([bar*16+tick,8,60+pc,60]);bass.push([bar*16+tick,8,36+pcs[0]!,65]);}
    for(let n=0;n<3;n++)lead.push([bar*16+[0,6,12][n]!,3,60+pcs[(n+stage)%3]!,70]);
    for(let n=0;n<4;n++)rhythm.push([bar*16+n*4,1,36,75]);
  }
  return {lead,chords,bass,...(drums?{drums:rhythm}:{})};
}

function wirePhrase(bars:number,drums:boolean,stage:number,properties:Record<string,unknown>) {
  const raw=phraseFixture(bars,drums,stage);
  return Object.fromEntries(Array.from({length:bars},(_,bar)=>{
    const chordNotes=raw.chords.filter(n=>Math.floor(n[0]!/16)===bar);
    const chordTicks=[...new Set(chordNotes.map(n=>n[0]!))];
    const rowSchema=properties['bar'+bar] as {properties:{chords:{prefixItems:{properties:{voices:{enum:number[][]}}}[]};bass:{prefixItems:{properties:{pitch:{enum:number[]}}}[]};drums?:{properties?:Record<string,{properties?:{timing:{enum:number[][]};pitch:{enum:number[]};velocity:{enum:number[]}}}>}}};
    const allowedVoicings=rowSchema.properties.chords.prefixItems[0]!.properties.voices.enum;
    const allowedBass=rowSchema.properties.bass.prefixItems[0]!.properties.pitch.enum;
    const chords=chordTicks.map(tick=>({timing:[(tick-bar*16)*3,24],voices:allowedVoicings[0]!,velocity:60}));
    const rows:Record<string,unknown>=Object.fromEntries(Object.entries(raw).filter(([key])=>key!=='chords').map(([key,notes])=>[key,notes.filter(n=>Math.floor(n[0]!/16)===bar).map(n=>({timing:[(n[0]!-bar*16)*3,n[1]!*3],pitch:n[2]!,velocity:n[3]!}))]));
    if(drums&&rowSchema.properties.drums?.properties)rows.drums=Object.fromEntries(Object.entries(rowSchema.properties.drums.properties).map(([key,item])=>[key,key==='fills'?[]:{timing:item.properties!.timing.enum[0]!,pitch:item.properties!.pitch.enum[0]!,velocity:item.properties!.velocity.enum[0]!}]));
    return ['bar'+bar,{...rows,bass:(rows.bass as {timing:number[];pitch:number;velocity:number}[]).map(n=>({...n,pitch:allowedBass[0]})),chords}];
  })) as Record<string,{lead:{timing:number[];pitch:number;velocity:number}[];chords:{timing:number[];voices:number[];velocity:number}[];bass:{timing:number[];pitch:number;velocity:number}[];drums?:{timing:number[];pitch:number;velocity:number}[]}>;
}
