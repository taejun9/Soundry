import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { OllamaRunner } from './ollama-runner.js';
import { ProviderService, readMusicProvider } from './provider.service.js';
import { CLI_OUTPUT_LIMIT } from './cli-runner.js';
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
async function server(options: { cloud?: boolean; remote?: boolean; output?: string; redirect?: boolean; pending?: boolean; missing?: boolean } = {}) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const instance = createServer(async (req, res) => {
    let data = ''; for await (const chunk of req) data += chunk;
    calls.push({ path: req.url!, body: data ? JSON.parse(data) : {} }); res.setHeader('Content-Type','application/json');
    if (req.url === '/api/status') res.end(JSON.stringify({ cloud: { disabled: !options.cloud } }));
    else if (req.url === '/api/show') { if (options.missing) { res.statusCode = 404; res.end('{}'); } else res.end(JSON.stringify({ model_info: { architecture: 'gemma' }, capabilities: ['completion'], ...(options.remote ? { remote_host: 'https://private.test' } : {}) })); }
    else if (options.redirect) { res.statusCode = 302; res.setHeader('Location','http://127.0.0.1:1/private'); res.end(); }
    else if (!options.pending) res.end(options.output ?? JSON.stringify({ done: true, done_reason: 'stop', response: '{"version":1}' }));
  }); servers.push(instance);
  await new Promise<void>(resolve => instance.listen(0, '127.0.0.1', resolve));
  return { calls, port: String((instance.address() as AddressInfo).port) };
}
const signal = () => new AbortController().signal;
describe('local Ollama composition boundary', () => {
  it('uses explicit local configuration, a schema and no remote fallback', async () => {
    const s = await server(); const runner = new OllamaRunner({ port: s.port, model: 'gemma3:4b' });
    expect(readMusicProvider('ollama')).toBe('ollama');
    expect(new ProviderService('ollama').summary().notice).not.toContain('Codex');
    expect(new ProviderService('ollama').summary()).toMatchObject({ id: 'ollama', isMock: false, configured: false });
    expect(await runner.probe(signal())).toBe('ready');
    const schema = { type: 'object' }; expect(await runner.compose('original request', schema, signal())).toEqual({ version: 1 });
    const body = s.calls.at(-1)!.body;
    expect(body).toMatchObject({ model: 'gemma3:4b', stream: false, format: schema, options: { num_ctx: 16384 } });
    expect(body.prompt).toContain('original request'); expect(body).not.toHaveProperty('tools');
  });
  it('requires cloud disabled and rejects remote aliases before sending composition text', async () => {
    for (const options of [{ cloud: true }, { remote: true }, { missing: true }]) {
      const s = await server(options); const runner = new OllamaRunner({ port: s.port });
      await expect(runner.compose('private knowledge', {}, signal())).rejects.toMatchObject({ code: options.cloud ? 'LOCAL_CLOUD_ENABLED' : 'LOCAL_MODEL_MISSING' });
      expect(s.calls.every(c => !JSON.stringify(c).includes('private knowledge'))).toBe(true);
      expect(s.calls.some(c => c.path === '/api/generate')).toBe(false);
    }
  });
  it('rejects arbitrary endpoints, cloud models and malformed settings', () => {
    for (const port of ['0','80','65536','http://example.test','11434/path']) expect(() => new OllamaRunner({ port })).toThrow('INVALID_OLLAMA_PORT');
    for (const model of ['gemma:cloud','../gemma','https://host/model','', 'a'.repeat(81)]) expect(() => new OllamaRunner({ model })).toThrow('INVALID_LOCAL_MODEL');
  });
  it('bounds response bytes, rejects redirects/incomplete/invalid output, and hides raw errors', async () => {
    for (const options of [{ output: 'x'.repeat(CLI_OUTPUT_LIMIT + 10) }, { redirect: true }, { output: '{"done":false,"response":"{}"}' }, { output: '{"done":true,"response":"secret /private/path"}' }, { output: '{"done":true,"response":"{}","remote_host":"https://private.test"}' }]) {
      const s = await server(options); const runner = new OllamaRunner({ port: s.port });
      await expect(runner.compose('request', {}, signal())).rejects.toMatchObject({ code: options.redirect ? 'LOCAL_FAILED' : options.output!.startsWith('x') ? 'LOCAL_OUTPUT_TOO_LARGE' : 'LOCAL_INVALID_OUTPUT' });
    }
  });
  it('propagates cancellation and finite generation timeout', async () => {
    const s = await server({ pending: true }); const controller = new AbortController();
    const pending = new OllamaRunner({ port: s.port }).compose('request', {}, controller.signal);
    setTimeout(() => controller.abort(), 30); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(new OllamaRunner({ port: s.port, timeoutMs: 30 }).compose('request', {}, signal())).rejects.toMatchObject({ code: 'LOCAL_TIMEOUT' });
  });
});
