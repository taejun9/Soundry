import {composeReference} from './composition/reference-composer.js';
import { composeSectional } from './composition/sectional-composer.js';
import { CLI_OUTPUT_LIMIT, throwIfCancelled } from './cli-runner.js';
import type { CliAvailability, CompositionRunner } from './cli-runner.js';
import { ProviderError } from './provider-error.js';
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
/** Full grammar stays in response_format; avoid filling the model context with repetitive numeric vocabularies. */
export function compactSchemaGuide(value: unknown): unknown {
  if(Array.isArray(value))return value.map(compactSchemaGuide);
  if(!object(value))return value;
  const keys=Object.keys(value);
  if(keys.length&&keys.every(key=>/^bar[0-7]$/.test(key))&&object(value.bar0)&&object(value.bar0.properties)&&object(value.bar0.properties.chords)&&object(value.bar0.properties.bass)) {
    const harmonies=Object.fromEntries(keys.map(key=>{
      const bar=value[key] as {properties:{chords:{prefixItems:{properties:{voices:{enum:unknown[]}}}[]};bass:{prefixItems:{properties:{pitch:{enum:unknown[]}}}[]}}};
      const choices=bar.properties.chords.prefixItems[0]!.properties.voices.enum;
      return [key,{chordChoices:[choices[0],choices[Math.floor(choices.length/2)],choices.at(-1)],bassPitchChoices:bar.properties.bass.prefixItems[0]!.properties.pitch.enum}];
    }));
    return {requiredBarNames:keys,sharedBarShape:compactSchemaGuide(value.bar0),harmonies,note:"Every bar uses this shape; use that bar's own harmonic choices. All full numeric choices remain in the server grammar."};
  }
  const result:Record<string,unknown>={};
  for(const [key,item] of Object.entries(value)) {
    if(key==='enum'&&Array.isArray(item)&&item.length>12)result.enumExamples=[...new Set([0,Math.floor(item.length/4),Math.floor(item.length/2),Math.floor(item.length*3/4),item.length-1])].map(index=>item[index]);
    else result[key]=compactSchemaGuide(item);
  }
  return result;
}
/** Connects only to an already-running local llama.cpp server; never loads/downloads a model. */
export class LlamaCppRunner implements CompositionRunner {
  private readonly base: string;
  private modelId?: string;
  private composedModelId?: string;
  private composedProfile='sectional-v2';
  private readonly timeoutMs: number;
  constructor(options: { port?: string; timeoutMs?: number } = {}) {
    const port = options.port ?? process.env.SOUNDRY_LLAMA_PORT ?? '8089';
    if (!/^\d{1,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error('INVALID_LLAMA_PORT');
    this.base = 'http://127.0.0.1:' + Number(port);
    this.timeoutMs = options.timeoutMs ?? 240_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 240_000) throw new Error('INVALID_LOCAL_TIMEOUT');
  }
  get modelLabel(): string { return this.label(this.modelId); }
  get compositionModelLabel(): string { return this.label(this.composedModelId ?? this.modelId,this.composedProfile); }
  private label(modelId: string | undefined,profile='sectional-v2'): string {
    // Server model IDs may contain local paths. Only a bounded basename can reach UI/DB.
    return 'llamacpp:' + (modelId?.split(/[\\/]/).at(-1)?.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0,90) ?? 'local') + ':'+profile;
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
    const result = await this.request('/v1/chat/completions', { model: modelId, messages: [{ role: 'user',content: prompt + '\nEmit minified JSON on one line, with no indentation or line breaks; preserve every required musical note.\nOutput shape guide (full numeric choices are enforced by the server grammar):\n' + JSON.stringify(compactSchemaGuide(schema)) }],
      stream: false, temperature: 0.7, max_tokens: 8192, reasoning_effort: 'none', chat_template_kwargs: { enable_thinking: false },
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
    const deadline = AbortSignal.timeout(16 * 60_000);
    const workSignal = AbortSignal.any([signal,deadline]);
    try {
      const referenceMode=object(schema)&&object(schema['x-soundry-quality'])&&schema['x-soundry-quality'].version===3;
      const result = referenceMode?await composeReference(prompt,schema as Record<string,unknown>,(p,s,abort)=>this.chat(p,s,abort,modelId),workSignal):object(schema) && object(schema['x-soundry-quality']) && schema['x-soundry-quality'].version === 2
        ? await composeSectional(prompt,schema,(p,s,abort)=>this.chat(p,s,abort,modelId),workSignal)
        : await this.chat(prompt,schema,workSignal,modelId);
      this.composedModelId = modelId;this.composedProfile=referenceMode?'reference-v3':'sectional-v2';
      return result;
    } catch (error) {
      throwIfCancelled(signal);
      if (deadline.aborted) throw new ProviderError('LOCAL_TIMEOUT');
      throw error;
    }
  }
}
