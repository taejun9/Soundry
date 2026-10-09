import { CLI_OUTPUT_LIMIT, throwIfCancelled } from './cli-runner.js';
import type { CliAvailability, CompositionRunner } from './cli-runner.js';
import { ProviderError } from './provider-error.js';
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
/** Connects only to an already-running local llama.cpp server; never loads/downloads a model. */
export class LlamaCppRunner implements CompositionRunner {
  private readonly base: string;
  private modelId?: string;
  private composedModelId?: string;
  private readonly timeoutMs: number;
  constructor(options: { port?: string; timeoutMs?: number } = {}) {
    const port = options.port ?? process.env.SOUNDRY_LLAMA_PORT ?? '8089';
    if (!/^\d{1,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error('INVALID_LLAMA_PORT');
    this.base = 'http://127.0.0.1:' + Number(port);
    this.timeoutMs = options.timeoutMs ?? 240_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 240_000) throw new Error('INVALID_LOCAL_TIMEOUT');
  }
  get modelLabel(): string { return this.label(this.modelId); }
  get compositionModelLabel(): string { return this.label(this.composedModelId ?? this.modelId); }
  private label(modelId: string | undefined): string {
    // Server model IDs may contain local paths. Only a bounded basename can reach UI/DB.
    return 'llamacpp:' + (modelId?.split(/[\\/]/).at(-1)?.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0,90) ?? 'local') + ':score-v1';
  }
  private async request(path: string, body: object | undefined, signal: AbortSignal, limit: number): Promise<unknown> {
    throwIfCancelled(signal); const timeout = AbortSignal.timeout(limit);
    try {
      const response = await fetch(this.base + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.any([signal,timeout]),
        headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) { await response.body?.cancel(); throw new ProviderError('LOCAL_UNAVAILABLE'); }
      if (!response.body) throw new ProviderError('LOCAL_INVALID_OUTPUT');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
      try { for (;;) { const { value,done } = await reader.read(); if (done) break; bytes += value.length;
        if (bytes > CLI_OUTPUT_LIMIT) throw new ProviderError('LOCAL_OUTPUT_TOO_LARGE'); chunks.push(value); } }
      finally { await reader.cancel(); reader.releaseLock(); }
      try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown; }
      catch { throw new ProviderError('LOCAL_INVALID_OUTPUT'); }
    } catch (error) {
      throwIfCancelled(signal); if (timeout.aborted) throw new ProviderError('LOCAL_TIMEOUT');
      if (error instanceof ProviderError) throw error; throw new ProviderError('LOCAL_UNAVAILABLE');
    }
  }
  async probe(signal: AbortSignal): Promise<CliAvailability> {
    try {
      const health = await this.request('/health',undefined,signal,3000);
      if (!object(health) || health.status !== 'ok') return 'LOCAL_UNAVAILABLE';
      const models = await this.request('/v1/models',undefined,signal,3000);
      if (!object(models) || !Array.isArray(models.data) || models.data.length !== 1 || !object(models.data[0])) return 'LOCAL_MODEL_MISSING';
      const model = models.data[0];
      if (typeof model.id !== 'string' || !model.id.trim() || model.id.length > 1024 || Array.from(model.id).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || model.remote_host || model.remote_model || (object(model.status) && model.status.value !== 'loaded')) return 'LOCAL_MODEL_MISSING';
      this.modelId = model.id; return 'ready';
    } catch { throwIfCancelled(signal); return 'LOCAL_UNAVAILABLE'; }
  }
  private async chat(prompt: string, schema: object, signal: AbortSignal, modelId: string | undefined): Promise<unknown> {
    const result = await this.request('/v1/chat/completions', { model: modelId, messages: [{ role: 'user',content: prompt + '\nExact output schema:\n' + JSON.stringify(schema) }],
      stream: false, temperature: 0.7, max_tokens: 4096, reasoning_effort: 'none', chat_template_kwargs: { enable_thinking: false },
      response_format: { type: 'json_object',schema }, cache_prompt: true },signal,this.timeoutMs);
    if (!object(result) || !Array.isArray(result.choices) || result.choices.length !== 1) throw new ProviderError('LOCAL_INVALID_OUTPUT');
    const choice = result.choices[0];
    if (!object(choice) || choice.finish_reason !== 'stop' || !object(choice.message) || typeof choice.message.content !== 'string' ||
      choice.message.role !== 'assistant' || (Array.isArray(choice.message.tool_calls) && choice.message.tool_calls.length > 0)) throw new ProviderError('LOCAL_INVALID_OUTPUT');
    try { return JSON.parse(choice.message.content) as unknown; } catch { throw new ProviderError('LOCAL_INVALID_OUTPUT'); }
  }
  async compose(prompt: string, schema: object, signal: AbortSignal): Promise<unknown> {
    const availability = await this.probe(signal);
    if (availability !== 'ready') throw new ProviderError(availability);
    const modelId = this.modelId;
    const properties = object(schema) && object(schema.properties) ? schema.properties : undefined;
    if (!properties?.patterns || !properties.parts || !object(properties.sections) || !Array.isArray(properties.sections.const)) { const result = await this.chat(prompt,schema,signal,modelId); this.composedModelId = modelId; return result; }
    const patternSchema = object(properties.patterns) ? properties.patterns : undefined;
    const patternItems = object(patternSchema?.items) ? patternSchema.items : undefined;
    const branches = Array.isArray(patternItems?.anyOf) ? patternItems.anyOf : [];
    const allowedIds = new Set<string>();
    for (const branch of branches) if (object(branch) && object(branch.properties) && object(branch.properties.id) && Array.isArray(branch.properties.id.enum)) for (const id of branch.properties.id.enum) if (typeof id === 'string') allowedIds.add(id);
    const needsDrums = [...allowedIds].filter(id => id.startsWith('m')).length === 4;
    const needsQuarterKick = branches.some(branch => {
      if (!object(branch) || !object(branch.properties) || !object(branch.properties.id) || !Array.isArray(branch.properties.id.enum) || !branch.properties.id.enum.includes('d1') || !object(branch.properties.notes) || !object(branch.properties.notes.items) || !object(branch.properties.notes.items.properties)) return false;
      const pitch=branch.properties.notes.items.properties.pitch; return object(pitch) && Array.isArray(pitch.enum) && pitch.enum.length===1 && pitch.enum[0]===36;
    });
    const bassId = needsDrums ? 'm3' : undefined;
    const firstSchema = { ...schema, properties: Object.fromEntries(Object.entries(properties).filter(([key])=>key!=='parts')), required: Object.keys(properties).filter(key=>key!=='parts') };
    const motifs = await this.chat(prompt + '\nPHASE 1: Compose exactly SIX UNIQUE compact musical patterns and the exact metadata/form only. Do not output parts in this phase. Each melodic pattern has exactly SIX notes in one or two bars. Do not expand repeated notes into a long array. Patterns m1..m8 are melodic; optional d1/d2 are drums. Build contrasting chord, bass and lead motifs.' + (needsDrums ? ' Use EXACTLY m1,m2,m3,m4,d1,d2. m3 is independent LOW BASS in pitches 28..52. d1 and d2 are percussion patterns. m1/m2/m4 carry chord, lead and answering material.' : '') + (needsQuarterKick ? ' d1 must be ONE bar with exactly FOUR kick notes: pitch36 at beats0,1,2,3, each with a short gate. d2 supplies other percussion.' : ''),firstSchema,signal,modelId);
    if (!object(motifs) || !Array.isArray(motifs.patterns) || motifs.patterns.length !== 6) throw new ProviderError('LOCAL_INVALID_OUTPUT');
    const ids = new Set<string>();
    for (const pattern of motifs.patterns) {
      if (!object(pattern) || typeof pattern.id !== 'string' || !/^(m[1-8]|d[12])$/.test(pattern.id) || ids.has(pattern.id) || !allowedIds.has(pattern.id) || typeof pattern.bars !== 'number' || !Number.isInteger(pattern.bars) || pattern.bars < 1 || pattern.bars > 2) throw new ProviderError('LOCAL_INVALID_OUTPUT');
      if (pattern.id === bassId && (!Array.isArray(pattern.notes) || pattern.notes.some((note:unknown) => !object(note) || typeof note.pitch !== 'number' || note.pitch < 28 || note.pitch > 52))) throw new ProviderError('LOCAL_INVALID_OUTPUT');
      if (needsQuarterKick && pattern.id==='d1' && (pattern.bars!==1 || !Array.isArray(pattern.notes) || pattern.notes.length!==4 || new Set(pattern.notes.map((note:unknown)=>object(note)&&note.pitch===36?note.beat:undefined)).size!==4 || pattern.notes.some((note:unknown)=>!object(note)||note.pitch!==36||![0,1,2,3].includes(note.beat as number)))) throw new ProviderError('LOCAL_INVALID_OUTPUT');
      ids.add(pattern.id);
    }
    const sectionSchemas: Record<string,unknown> = {};
    for (const section of properties.sections.const) {
      if (!object(section) || typeof section.name !== 'string' || typeof section.startBar !== 'number' || typeof section.bars !== 'number') throw new ProviderError('LOCAL_INVALID_OUTPUT');
      const choices = motifs.patterns.map((raw: unknown) => {
        const pattern = raw as { id:string; bars:number };
        const drum = pattern.id.startsWith('d');
        const bass = pattern.id === bassId;
        return { type:'object',additionalProperties:false,properties:{
          patternId:{type:'string',enum:[pattern.id]},instrument:{type:'string',enum:drum?['drums']:bass?['bass']:['synth','piano','guitar','strings','brass','organ','bell','pad',...(!needsDrums?['bass']:[])]},
          transpose:{type:'integer',minimum:-24,maximum:24,enum:drum||bass?[0]:[-24,-12,0,12,24]},gain:{type:'number',minimum:0.05,maximum:1},pan:{type:'number',minimum:-1,maximum:1},
        },required:['patternId','instrument','transpose','gain','pan'] };
      });
      sectionSchemas[section.name] = {type:'array',minItems:1,maxItems:6,items:{anyOf:choices}};
    }
    const secondSchema = {type:'object',additionalProperties:false,properties:sectionSchemas,required:Object.keys(sectionSchemas)};
    const arrangement = await this.chat(prompt + '\nPHASE 2: Arrange ONLY the existing pattern IDs below into each required section. Use at least FOUR distinct melodic patterns across the song and vary instrumentation/density over sections. There is at least one part per section. The application computes exact start/repeat timing from each section. Do not redefine notes or invent pattern IDs.\nExisting motif data:\n' + JSON.stringify(motifs) + (needsDrums ? '\nPercussion is requested: include d1 or d2 as drums in the chorus. Use all FOUR m1..m4 melodic motifs and play m3 only as low bass, without transposition.' : '') + (needsQuarterKick ? '\nUse d1 as drums in BOTH verse and chorus for the requested four-on-the-floor groove.' : ''),secondSchema,signal,modelId);
    if (!object(arrangement)) throw new ProviderError('LOCAL_INVALID_OUTPUT');
    const parts: unknown[] = [];
    for (const section of properties.sections.const) {
      const row = section as {name:string;startBar:number;bars:number};const entries=arrangement[row.name];
      if (needsQuarterKick && ['verse','chorus'].includes(row.name) && (!Array.isArray(entries) || !entries.some(entry=>object(entry)&&entry.instrument==='drums'&&entry.patternId==='d1'))) throw new ProviderError('LOCAL_INVALID_OUTPUT');
      if (needsDrums && row.name === 'chorus' && (!Array.isArray(entries) || !entries.some(entry => object(entry) && entry.instrument === 'drums'))) throw new ProviderError('LOCAL_INVALID_OUTPUT');
      if (!Array.isArray(entries) || entries.length < 1 || entries.length > 6) throw new ProviderError('LOCAL_INVALID_OUTPUT');
      for (const entry of entries) {
        if (!object(entry) || typeof entry.patternId !== 'string') throw new ProviderError('LOCAL_INVALID_OUTPUT');
        const pattern = motifs.patterns.find((p: unknown)=>object(p) && p.id === entry.patternId) as {bars:number}|undefined;
        if (!pattern || (entry.patternId === bassId && (entry.instrument !== 'bass' || entry.transpose !== 0)) || (needsDrums && entry.instrument === 'bass' && entry.patternId !== bassId) || (entry.instrument === 'drums' ? !entry.patternId.startsWith('d') || entry.transpose !== 0 : entry.patternId.startsWith('d') || ![-24,-12,0,12,24].includes(entry.transpose as number))) throw new ProviderError('LOCAL_INVALID_OUTPUT');
        parts.push({...entry,startBar:row.startBar,repeats:Math.ceil(row.bars/pattern.bars)});
      }
    }
    const used=new Set(parts.map(p=>(p as {patternId:string}).patternId));
    this.composedModelId = modelId;
    return {...motifs,sections:properties.sections.const,patterns:motifs.patterns.filter((p:unknown)=>object(p)&&used.has(p.id as string)),parts};
  }
}
