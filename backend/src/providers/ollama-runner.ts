import { CLI_OUTPUT_LIMIT, throwIfCancelled } from './cli-runner.js';
import type { CliAvailability, CompositionRunner } from './cli-runner.js';
import { ProviderError } from './provider-error.js';

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export class OllamaRunner implements CompositionRunner {
  readonly model: string;
  private readonly base: string;
  constructor(options: { port?: string; model?: string; timeoutMs?: number } = {}) {
    const port = options.port ?? process.env.SOUNDRY_OLLAMA_PORT ?? '11434';
    this.model = options.model ?? process.env.SOUNDRY_COMPOSER_MODEL ?? 'gemma3:4b';
    if (!/^\d{1,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error('INVALID_OLLAMA_PORT');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(this.model) || /cloud/i.test(this.model)) throw new Error('INVALID_LOCAL_MODEL');
    this.base = 'http://127.0.0.1:' + Number(port);
    this.timeoutMs = options.timeoutMs ?? 240_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 240_000) throw new Error('INVALID_LOCAL_TIMEOUT');
  }
  private readonly timeoutMs: number;
  private async request(path: string, body: object | undefined, signal: AbortSignal, timeoutMs: number): Promise<unknown> {
    throwIfCancelled(signal);
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = AbortSignal.any([signal, timeout]);
    try {
      const response = await fetch(this.base + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal: combined,
        headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) { await response.body?.cancel(); throw new ProviderError(response.status === 404 && path === '/api/show' ? 'LOCAL_MODEL_MISSING' : 'LOCAL_FAILED'); }
      if (!response.body) throw new ProviderError('LOCAL_INVALID_OUTPUT');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.length; if (size > CLI_OUTPUT_LIMIT) throw new ProviderError('LOCAL_OUTPUT_TOO_LARGE');
          chunks.push(value);
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown;
    } catch (error) {
      throwIfCancelled(signal);
      if (timeout.aborted) throw new ProviderError('LOCAL_TIMEOUT');
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('LOCAL_FAILED');
    }
  }
  async probe(signal: AbortSignal): Promise<CliAvailability> {
    try {
      // Fail closed on older servers lacking status. Cloud aliases cannot receive a prompt.
      const status = await this.request('/api/status', undefined, signal, 3000);
      if (!object(status) || !object(status.cloud) || status.cloud.disabled !== true) return 'LOCAL_CLOUD_ENABLED';
      const value = await this.request('/api/show', { model: this.model }, signal, 3000);
      if (!object(value) || value.remote_host || value.remote_model) return 'LOCAL_MODEL_MISSING';
      if (!object(value.model_info) || !Array.isArray(value.capabilities) || !value.capabilities.includes('completion')) return 'LOCAL_MODEL_MISSING';
      return 'ready';
    } catch (error) { throwIfCancelled(signal); return error instanceof ProviderError && error.code === 'LOCAL_MODEL_MISSING' ? 'LOCAL_MODEL_MISSING' : 'LOCAL_UNAVAILABLE'; }
  }
  async compose(prompt: string, schema: object, signal: AbortSignal): Promise<unknown> {
    const ready = await this.probe(signal);
    if (ready !== 'ready') throw new ProviderError(ready);
    const result = await this.request('/api/generate', { model: this.model, prompt: prompt + '\nOutput JSON schema:\n' + JSON.stringify(schema), format: schema,
      stream: false, keep_alive: '5m', options: { temperature: 0.7, num_ctx: 16384, num_predict: 16000 } }, signal, this.timeoutMs);
    if (!object(result) || result.done !== true || typeof result.response !== 'string' || result.remote_host || result.remote_model || (result.done_reason !== undefined && result.done_reason !== 'stop')) throw new ProviderError('LOCAL_INVALID_OUTPUT');
    try { return JSON.parse(result.response) as unknown; } catch { throw new ProviderError('LOCAL_INVALID_OUTPUT'); }
  }
}
