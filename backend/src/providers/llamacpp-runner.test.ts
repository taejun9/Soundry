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
    expect(await runner.probe(signal())).toBe('ready');expect(runner.modelLabel).toBe('llamacpp:gemma-Q4.gguf:score-v1');
    const schema={type:'object'};expect(await runner.compose('original music',schema,signal())).toEqual({version:1});
    expect(s.calls.at(-1)!.body).toMatchObject({model:'/private/models/gemma-Q4.gguf',response_format:{type:'json_object',schema},stream:false,reasoning_effort:'none',chat_template_kwargs:{enable_thinking:false}});
    expect(s.calls.at(-1)!.body).not.toHaveProperty('tools');expect(runner.modelLabel).not.toContain('/private'); expect(runner.compositionModelLabel).toBe('llamacpp:gemma-Q4.gguf:score-v1');
    models.data[0]!.id='/private/models/next.gguf';await runner.probe(signal());expect(runner.modelLabel).toBe('llamacpp:next.gguf:score-v1');expect(runner.compositionModelLabel).toBe('llamacpp:gemma-Q4.gguf:score-v1');
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
  it('composes motifs then arranges only existing IDs with app-calculated section timing',async()=>{
    const input={prompt:'original Classical',settings:{bpm:120,durationSeconds:90,genre:'Classical',mood:'warm',seed:'original'},variationCount:1};
    const respond=(body:Record<string,unknown>)=>{
      const schema=(body.response_format as {schema:{properties:Record<string,unknown>}}).schema;
      let output:unknown;
      if(schema.properties.patterns) output={version:1,bpm:120,genre:'Classical',mood:'warm',seed:'original',sections:(schema.properties.sections as {const:unknown}).const,patterns:Array.from({length:6},(_,i)=>({id:'m'+(i+1),bars:1,notes:Array.from({length:6},(_,n)=>({beat:n/2,duration:0.4,pitch:48+i*2+n,velocity:0.6}))}))};
      else output=Object.fromEntries(Object.keys(schema.properties).map((name,index)=>[name,[0,1].map(n=>({patternId:'m'+((index*2+n)%6+1),instrument:n?'piano':'bass',transpose:0,gain:0.4,pan:n?0.2:0}))]));
      return {choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]};
    };
    const s=await server({respond});const result=await new LlamaCppRunner({port:s.port}).compose('original musical request',llamaCompositionSchema(input),signal());
    const score=parseComposition(result,input);expect(score.parts).toHaveLength(10);expect(score.parts[0]).toMatchObject({startBar:0,repeats:4});expect(score.parts.at(-1)).toMatchObject({startBar:34,repeats:11});
    expect(s.calls.filter(c=>c.path==='/v1/chat/completions')).toHaveLength(2);
  });
  it('keeps requested percussion and low bass, and rejects missing drums, high bass or incompatible transposition',async()=>{
    const input={prompt:'Pop with drums',settings:{bpm:120,durationSeconds:90,genre:'Pop',mood:'bright',seed:'original'},variationCount:1};
    for (const mode of ['valid','missing-drums','high-bass','semitone','wrong-bass']) {
      const respond=(body:Record<string,unknown>)=>{
        const schema=(body.response_format as {schema:{properties:Record<string,unknown>}}).schema;
        const ids=['m1','m2','m3','m4','d1','d2'];
        let output:unknown;
        if (schema.properties.patterns) output={version:1,...input.settings,sections:(schema.properties.sections as {const:unknown}).const,patterns:ids.map((id,i)=>({id,bars:1,notes:Array.from({length:6},(_,n)=>({beat:n/2,duration:0.4,pitch:id.startsWith('d')?[36,38,42,36,38,42][n]:id==='m3'?(mode==='high-bass'?70:40)+n:60+i*2+n,velocity:0.6}))}))};
        else output=Object.fromEntries(Object.keys(schema.properties).map((name,index)=>[name,ids.filter(id=>!(mode==='missing-drums'&&name==='chorus'&&id.startsWith('d'))).map(id=>({patternId:id,instrument:id.startsWith('d')?'drums':id==='m3'?'bass':mode==='wrong-bass'&&id==='m1'?'bass':id==='m1'?'piano':'synth',transpose:mode==='semitone'&&id==='m1'?1:0,gain:0.3+index*0.05,pan:0}))]));
        if (schema.properties.patterns) delete (output as Record<string,unknown>).durationSeconds;
        return {choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]};
      };
      const s=await server({respond}); const call=new LlamaCppRunner({port:s.port}).compose('original music',llamaCompositionSchema(input),signal());
      if (mode==='valid') { const score=parseComposition(await call,input);expect(score.parts.some(part=>part.instrument==='drums')).toBe(true);expect(score.parts.filter(part=>part.instrument==='bass').every(part=>part.patternId==='m3'&&part.transpose===0)).toBe(true); }
      else await expect(call).rejects.toMatchObject({code:'LOCAL_INVALID_OUTPUT'});
    }
  });

  it('retains explicit quarter kicks in verse and chorus and rejects duplicate kick beats or omitted groove',async()=>{
    const input={prompt:'House four-on-the-floor drums',settings:{bpm:120,durationSeconds:90,genre:'House',mood:'bright',seed:'original'},variationCount:1};
    for (const mode of ['valid','duplicate-beat','missing-verse']) {
      const respond=(body:Record<string,unknown>)=>{
        const schema=(body.response_format as {schema:{properties:Record<string,unknown>}}).schema;const ids=['m1','m2','m3','m4','d1','d2'];
        const output=schema.properties.patterns?{version:1,bpm:120,genre:'House',mood:'bright',seed:'original',sections:(schema.properties.sections as {const:unknown}).const,patterns:ids.map((id,i)=>({id,bars:1,notes:Array.from({length:id==='d1'?4:6},(_,n)=>({beat:id==='d1'?(mode==='duplicate-beat'&&n===1?0:n):n/2,duration:0.25,pitch:id==='d1'?36:id==='d2'?42:id==='m3'?40+n:60+i*2+n,velocity:0.6}))}))}:Object.fromEntries(Object.keys(schema.properties).map((name,index)=>[name,ids.filter(id=>!(mode==='missing-verse'&&name==='verse'&&id==='d1')).map(id=>({patternId:id,instrument:id.startsWith('d')?'drums':id==='m3'?'bass':'piano',transpose:0,gain:0.3+index*0.05,pan:0}))]));
        return {choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]};
      };
      const s=await server({respond});const call=new LlamaCppRunner({port:s.port}).compose('original',llamaCompositionSchema(input),signal());
      if(mode==='valid') {const score=parseComposition(await call,input);expect(score.patterns.find(pattern=>pattern.id==='d1')!.notes.map(note=>note.beat)).toEqual([0,1,2,3]);}
      else await expect(call).rejects.toMatchObject({code:'LOCAL_INVALID_OUTPUT'});
    }
  });

});
