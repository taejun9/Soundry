#!/usr/bin/env node
/**
 * 사용자가 명시적으로 실행하는 1–20곡 제작 도구. 작곡 공급자는 직접 호출하지 않고 로컬 앱 API를 쓴다.
 * 제출 전 영속화한 요청 키로 재개하며 응답 유실·timeout·실패를 자동 새 생성으로 바꾸지 않는다.
 * 외부 URL·symlink·기존 원본 덮어쓰기를 거부하고 검증된 WAV만 완료 manifest에 공개한다.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, realpath, open, readFile, rename, unlink, link } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MODEL = 'codex-composer-local-synth-v1';
const states = new Set(['queued', 'processing', 'completed', 'failed', 'cancelled']);
// URL/path에 들어가는 식별자는 한 segment만 허용하고 길이를 제한한다.
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// 객체 key 순서 차이는 무시하되 값과 배열 순서는 보존해 같은 입력인지 비교한다.
const canonical = value => JSON.stringify(value, (_key, item) => object(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
/** 외부 응답 전체 대신 호출자가 작성한 제한된 안내만 오류로 전파한다. */
function fail(message) { throw new Error(message); }
/** CLI가 지원하는 1개 연주곡 입력만 정규화해 저장한다. 알 수 없는 설정은 조용히 버리지 않는다. */
function inputSnapshot(value) {
  if (!object(value) || Object.keys(value).sort().join() !== 'prompt,settings,variationCount' || typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.trim().length > 4000 || value.prompt.includes('\0') || value.variationCount !== 1 || !object(value.settings)) fail('제작 계획의 GenerationInput이 올바르지 않습니다.');
  const settings = {};
  for (const [key, original] of Object.entries(value.settings)) {
    if (!['mode', 'genre', 'mood', 'bpm', 'durationSeconds', 'seed'].includes(key)) fail('허용되지 않은 생성 설정이 있습니다.');
    if (['mode', 'genre', 'mood', 'seed'].includes(key)) {
      if (typeof original !== 'string' || !original.trim() || original.includes('\0') || original.trim().length > (key === 'seed' ? 64 : 80) || (key === 'mode' && original !== 'instrumental')) fail('생성 문자열 설정이 허용 범위를 벗어났습니다.');
      settings[key] = original.trim();
    } else {
      const [minimum, maximum] = key === 'bpm' ? [40, 220] : [90, 180];
      if (typeof original !== 'number' || !Number.isFinite(original) || original < minimum || original > maximum) fail('생성 숫자 설정이 허용 범위를 벗어났습니다.');
      settings[key] = original;
    }
  }
  return { prompt: value.prompt.trim(), settings, variationCount: 1 };
}
/** credentials·경로·query 없는 명시적 loopback HTTP origin만 허용한다. */
function origin(value) {
  let url; try { url = new URL(value); } catch { fail('올바른 로컬 origin을 지정하세요.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port || Number(url.port) < 1024 || Number(url.port) > 65535 || url.username || url.password || url.search || url.hash || url.pathname !== '/') fail('127.0.0.1 또는 localhost의 명시적 HTTP 포트만 허용합니다.');
  return url.origin;
}
/** 부재만 null로 반환하고 권한·I/O 실패를 없는 파일로 오인하지 않는다. */
async function existing(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
/** 상위 폴더부터 실제 경로를 확인해 symlink를 통한 state root 탈출을 거부한다. */
async function directory(path) {
  const found = await existing(path);
  if (!found) { await directory(dirname(path)); await mkdir(path, { mode: 0o700 }); }
  const checked = await lstat(path);
  if (!checked.isDirectory() || checked.isSymbolicLink() || await realpath(path) !== path) fail('state 폴더와 상위 경로는 symlink가 없는 실제 폴더여야 합니다.');
}
/** 부재일 때만 기본 상태를 사용한다. 깨진/과대/비정상 파일은 기존 상태를 보존하며 실패한다. */
async function readJson(path, fallback) {
  const stat = await existing(path);
  if (!stat) return fallback;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) fail('상태 JSON은 2 MiB 이하의 일반 파일이어야 합니다.');
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { fail('상태 JSON을 읽지 못했습니다. 기존 파일을 확인하세요.'); }
}
/** 배타적 임시 파일 → fsync → rename → 폴더 fsync 순서로 checkpoint를 교체한다. */
async function writeJson(path, value) {
  const stat = await existing(path);
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) fail('기존 상태 파일이 일반 파일이 아닙니다.');
  const temporary = path + '.' + randomUUID() + '.tmp';
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temporary, path); const folder = await open(dirname(path), 'r'); try { await folder.sync(); } finally { await folder.close(); } }
  finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
/** 이미 존재하는 원본도 regular file·크기 경계를 재확인한 후 읽는다. */
async function originalBytes(path) {
  const stat = await existing(path);
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size < 44 || stat.size > MAX_AUDIO_BYTES) fail('완료 원본 파일이 없거나 형식/크기가 올바르지 않습니다.');
  return readFile(path);
}
/** 선언 길이뿐 아니라 streaming 누적 크기와 최종 길이를 검사해 무제한 메모리 사용을 막는다. */
async function responseBytes(response, maximum) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) { await response.body?.cancel(); fail('응답 크기 제한을 초과했습니다.'); }
  if (!response.body) fail('응답 내용이 없습니다.');
  const reader = response.body.getReader(); const pieces = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) { await reader.cancel(); fail('응답 크기 제한을 초과했습니다.'); }
      pieces.push(Buffer.from(next.value));
    }
  } finally { reader.releaseLock(); }
  if (length !== null && Number(length) !== size) fail('응답 길이와 실제 bytes가 다릅니다.');
  return Buffer.concat(pieces, size);
}
/** 받은 job이 저장한 프로젝트·요청 키·입력·공급자와 같은 작업임을 확인한다. */
function checkJob(job, projectId, entry) {
  if (!object(job) || !safeId(job.id) || job.projectId !== projectId || job.requestKey !== entry.requestKey || job.provider !== 'cli' || job.model !== MODEL || !states.has(job.status) || !Array.isArray(job.tracks) || canonical(inputSnapshot({ prompt: job.prompt, settings: job.settings, variationCount: job.variationCount })) !== canonical(entry.input)) fail('작업 응답이 저장한 요청과 다릅니다. 새 작업을 자동 제출하지 않습니다.');
  if (entry.generationId && job.id !== entry.generationId) fail('작업 ID가 checkpoint와 다릅니다.');
  return job;
}
/** 완료 음원의 소속·실측 길이·WAV 형식과 ID 기반 로컬 다운로드 경로를 함께 검증한다. */
function checkTrack(track, job) {
  if (!object(track) || !safeId(track.id) || track.projectId !== job.projectId || track.generationId !== job.id || track.provider !== 'cli' || track.model !== MODEL || track.variationIndex !== 0 || track.mimeType !== 'audio/wav' || !Number.isInteger(track.byteSize) || track.byteSize < 44 || track.byteSize > MAX_AUDIO_BYTES || typeof track.durationSeconds !== 'number' || track.durationSeconds < 90 || track.durationSeconds > 180 || !Number.isFinite(track.durationSeconds) || track.downloadUrl !== `/api/tracks/${encodeURIComponent(track.id)}/download`) fail('완료 음원의 소속/길이/형식/로컬 다운로드 경계를 확인하지 못했습니다.');
  return track;
}

/**
 * 선택한 번호를 순차 처리하고 완료 수·건너뛴 수·manifest 경로를 반환한다.
 * fetch/clock/wait/log 주입은 외부 작곡 없이 중단·재개 경계를 재현하는 테스트 seam이다.
 * signal은 이 도구의 대기를 취소하며 이미 서버에 접수된 job을 취소하는 API 호출은 하지 않는다.
 */
export async function runBatch(options, dependencies = {}) {
  const apiOrigin = origin(options.origin ?? 'http://127.0.0.1:3000');
  const uiOrigin = origin(options.uiOrigin ?? 'http://127.0.0.1:5174');
  const planPath = resolve(options.plan ?? join(ROOT, 'harness/music/track-plan.json'));
  const stateDir = resolve(options.stateDir ?? join(ROOT, 'data/music'));
  const timeoutMs = options.timeoutMs ?? 20 * 60_000;
  const pollMs = options.pollMs ?? 3000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000 || !Number.isInteger(pollMs) || pollMs < 1) fail('대기 시간 설정이 올바르지 않습니다.');
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const wait = dependencies.wait ?? ((ms, signal) => delay(ms, undefined, { signal }));
  const now = dependencies.now ?? Date.now;
  const log = dependencies.log ?? (message => process.stdout.write(message + '\n'));
  const plan = await readJson(planPath, null);
  if (!object(plan) || plan.provider !== 'cli' || plan.model !== MODEL || !Array.isArray(plan.tracks) || (plan.tracks.length < 1 || plan.tracks.length > 20) || plan.tracks.some(track => !object(track) || !Number.isInteger(track.number)) || plan.tracks.map(track => track.number).sort((a, b) => a - b).join() !== Array.from({ length: plan.tracks.length }, (_, index) => index + 1).join()) fail('연속 번호의 CLI 1–20곡 제작 계획이 필요합니다.');
  const tracks = plan.tracks.map(track => {
    if (typeof track.title !== 'string' || !track.title.trim() || track.title.trim().length > 120 || [...track.title].some(character => character.charCodeAt(0) < 32 || character === '/' || character === '\\')) fail('제작 제목이 올바르지 않습니다.');
    return { ...track, title: track.title.trim(), input: inputSnapshot(track.input) };
  });
  const selected = options.numbers ?? tracks.map(track => track.number);
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length || selected.some(number => !Number.isInteger(number) || number < 1 || number > tracks.length)) fail('곡 번호는 제작 계획 안의 중복 없는 번호여야 합니다.');
  if (options.projectId !== undefined && !safeId(options.projectId)) fail('project ID 형식이 올바르지 않습니다.');
  await directory(stateDir); await directory(join(stateDir, 'originals'));
  // 한 state 폴더는 한 runner만 소유한다. 이전 실행 lock을 임의로 지워 중복 생성하지 않는다.
  const lockPath = join(stateDir, '.batch.lock'); let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') fail('다른 batch 실행 또는 남은 .batch.lock이 있습니다. 기존 프로세스를 확인한 뒤 재개하세요.'); throw error; }
  const lockStat = await lock.stat();
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n'); await lock.sync();
    const checkpointPath = join(stateDir, 'checkpoint.json'); const manifestPath = join(stateDir, 'completed-manifest.json');
    const state = await readJson(checkpointPath, { version: 1, projectId: null, projectCreationAttempted: false, entries: {} });
    const manifest = await readJson(manifestPath, { results: [] });
    if (!object(state) || state.version !== 1 || !(state.projectId === null || safeId(state.projectId)) || !object(state.entries) || typeof state.projectCreationAttempted !== 'boolean' || !object(manifest) || !Array.isArray(manifest.results)) fail('checkpoint/manifest 구조가 올바르지 않습니다.');
    if (options.projectId && state.projectId && options.projectId !== state.projectId) fail('다른 프로젝트로 checkpoint를 재사용할 수 없습니다.');
    if (options.projectId) state.projectId = options.projectId;
    for (const [number, entry] of Object.entries(state.entries)) {
      const track = tracks.find(item => String(item.number) === number);
      if (!track || !object(entry) || !safeId(entry.requestKey) || !(entry.generationId === null || safeId(entry.generationId)) || canonical(inputSnapshot(entry.input)) !== canonical(track.input)) fail('checkpoint의 곡 입력이 제작 계획과 다릅니다.');
    }
    // 완료 표시만 믿지 않고 실제 저장 원본과 checkpoint 연결을 먼저 전수 재검증한다.
    const complete = new Set();
    for (const result of manifest.results) {
      if (!object(result) || !Number.isInteger(result.trackNumber) || result.trackNumber < 1 || result.trackNumber > tracks.length || complete.has(result.trackNumber) || result.state !== 'completed' || result.provider !== 'cli' || result.model !== MODEL || !safeId(result.requestId) || !/^[a-f0-9]{64}$/.test(result.sha256)) fail('완료 manifest에 잘못된 결과가 있습니다.');
      const expected = join(stateDir, 'originals', `${String(result.trackNumber).padStart(2, '0')}-original.wav`);
      if (result.localFile !== expected || digest(await originalBytes(expected)) !== result.sha256) fail('완료 원본 SHA256 또는 로컬 경로가 manifest와 다릅니다.');
      const entry = state.entries[result.trackNumber];
      if (!entry || entry.generationId !== result.requestId) fail('완료 원본의 generation checkpoint가 없습니다.');
      complete.add(result.trackNumber);
    }
    const pending = selected.filter(number => !complete.has(number));
    if (!pending.length) return { completed: manifest.results.length, skipped: selected.length, projectId: state.projectId, manifestPath };
    /** 로컬 JSON API 호출도 응답 크기·시간·redirect를 제한하고 서버 오류 code만 노출한다. */
    async function request(path, method = 'GET', body) {
      const signal = AbortSignal.any([AbortSignal.timeout(15_000), ...(options.signal ? [options.signal] : [])]);
      let response;
      try { response = await fetchImpl(apiOrigin + '/api' + path, { method, redirect: 'error', signal, headers: { Accept: 'application/json', Origin: uiOrigin, ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Soundry-Request': '1' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
      catch { fail('로컬 API 응답을 받지 못했습니다. checkpoint를 보존했으므로 같은 명령으로 재개하세요.'); }
      const bytes = await responseBytes(response, 2 * 1024 * 1024); let value;
      try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('로컬 API JSON 응답이 잘못됐습니다. checkpoint를 확인하세요.'); }
      if (!response.ok) { const code = value?.error?.code; fail(`로컬 API가 요청을 거부했습니다: ${typeof code === 'string' && /^[A-Z0-9_]{1,80}$/.test(code) ? code : `HTTP_${response.status}`}. 자동으로 새 작업을 만들지 않습니다.`); }
      return value;
    }
    if (!state.projectId) {
      if (state.projectCreationAttempted) fail('프로젝트 생성 응답이 불확실합니다. 앱에서 프로젝트를 확인하고 --project-id로 연결하세요.');
      // 프로젝트 생성 응답이 유실되면 사용자 연결이 필요하므로 POST 이전에 시도 사실을 저장한다.
      state.projectCreationAttempted = true; await writeJson(checkpointPath, state);
      const project = await request('/projects', 'POST', { name: `Soundry · 콘셉트 ${tracks.length}곡` });
      if (!object(project) || !safeId(project.id)) fail('생성 프로젝트 ID를 확인하지 못했습니다. --project-id로 연결하세요.');
      state.projectId = project.id; await writeJson(checkpointPath, state);
    } else {
      const project = await request(`/projects/${encodeURIComponent(state.projectId)}`);
      if (project?.id !== state.projectId) fail('프로젝트 응답이 checkpoint와 다릅니다.');
      await writeJson(checkpointPath, state);
    }
    for (const number of pending) {
      options.signal?.throwIfAborted();
      const trackPlan = tracks.find(track => track.number === number);
      let entry = state.entries[number];
      if (!entry) {
        // 새 요청은 현재 CLI 준비 상태가 필요하다. 기존 요청 키는 이미 접수됐을 수 있어 별도로 다룬다.
        const provider = await request('/providers/current');
        if (!object(provider) || provider.id !== 'cli' || provider.model !== MODEL || provider.isMock !== false || provider.configured !== true || provider.generationEnabled !== true) fail('Codex CLI 공급자가 준비되지 않았습니다. 앱의 공급자 안내를 확인하세요.');
        entry = { requestKey: randomUUID(), input: trackPlan.input, generationId: null, state: 'prepared' };
        state.entries[number] = entry;
        await writeJson(checkpointPath, state); // 유일한 생성 POST보다 먼저 요청 키와 입력을 디스크에 확정한다.
      } else if (!entry.generationId) {
        // prepared 키는 첫 POST 전일 수도 있다. 공급자가 바뀐 상태에서 새 Mock job을 만들지 않는다.
        const provider = await request('/providers/current');
        if (!object(provider) || provider.id !== 'cli' || provider.model !== MODEL || provider.isMock !== false) fail('현재 공급자가 원래 CLI와 다릅니다. CLI 공급자로 되돌린 뒤 같은 요청의 접수 여부를 확인하세요.');
        // 로그아웃으로 준비 상태가 false여도 같은 CLI에서 이미 접수한 키는 조회·확인할 수 있다.
      }
      // generation ID가 있으면 GET으로만 재개한다. ID가 없을 때도 저장한 같은 키로만 접수 확인한다.
      const started = now();
      let job = checkJob(entry.generationId ? await request(`/generations/${encodeURIComponent(entry.generationId)}`) : await request(`/projects/${encodeURIComponent(state.projectId)}/generations`, 'POST', { ...entry.input, requestKey: entry.requestKey }), state.projectId, entry);
      entry.generationId = job.id; entry.state = job.status; await writeJson(checkpointPath, state);
      while (job.status === 'queued' || job.status === 'processing') {
        log(`${String(number).padStart(2, '0')}번: ${job.status}`);
        if (now() - started >= timeoutMs) fail(`${number}번 대기 시간이 끝났습니다. 같은 generation을 재개할 수 있으며 새 작업은 만들지 않습니다.`);
        await wait(Math.min(pollMs, timeoutMs - (now() - started)), options.signal);
        job = checkJob(await request(`/generations/${encodeURIComponent(entry.generationId)}`), state.projectId, entry);
        entry.state = job.status; await writeJson(checkpointPath, state);
      }
      if (job.status !== 'completed') fail(`${number}번 작업이 ${job.status} 상태입니다${typeof job.errorCode === 'string' && /^[A-Z0-9_]{1,80}$/.test(job.errorCode) ? ` (${job.errorCode})` : ''}. 원인을 확인하세요. 자동 재생성은 하지 않습니다.`);
      if (job.tracks.length !== 1) fail(`${number}번 완료 작업의 음원 1곡을 확인하지 못했습니다.`);
      let track = checkTrack(job.tracks[0], job);
      if (track.title !== trackPlan.title) {
        const updated = checkTrack(await request(`/tracks/${encodeURIComponent(track.id)}`, 'PATCH', { title: trackPlan.title }), job);
        if (updated.id !== track.id || updated.title !== trackPlan.title) fail('음원 이름 변경 응답이 선택한 곡과 다릅니다.');
        track = updated;
      }
      // 제목은 표시 metadata만 변경한다. 로컬 원본 경로는 고정 번호로 만들어 입력 경로를 받지 않는다.
      const outputPath = join(stateDir, 'originals', `${String(number).padStart(2, '0')}-original.wav`);
      let bytes;
      const previous = await existing(outputPath);
      if (previous) {
        bytes = await originalBytes(outputPath);
        if (!entry.audioSha256 || digest(bytes) !== entry.audioSha256 || bytes.length !== track.byteSize) fail('기존 원본이 검증된 checkpoint와 다릅니다. 파일을 덮어쓰지 않습니다.');
      } else {
        let response;
        try { response = await fetchImpl(apiOrigin + track.downloadUrl, { redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(60_000), ...(options.signal ? [options.signal] : [])]), headers: { Origin: uiOrigin } }); }
        catch { fail('원본 다운로드가 중단됐습니다. 같은 완료 작업으로 재개하세요.'); }
        if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'audio/wav') fail('원본 WAV 다운로드 응답을 확인하지 못했습니다.');
        bytes = await responseBytes(response, MAX_AUDIO_BYTES);
        if (bytes.length !== track.byteSize || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.readUInt32LE(4) + 8 !== bytes.length) fail('다운로드 bytes와 WAV 형식/길이가 다릅니다.');
        // publish보다 먼저 hash를 저장해 중간 종료 후 기존 파일을 안전하게 식별한다.
        entry.audioSha256 = digest(bytes); await writeJson(checkpointPath, state);
        const temporary = outputPath + '.' + randomUUID() + '.part'; const handle = await open(temporary, 'wx', 0o600);
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        // link는 기존 destination을 덮어쓰지 않는다. 임시 링크를 지우면 원본은 독립 nlink=1 파일로 남는다.
        try { await link(temporary, outputPath); } finally { await unlink(temporary); }
      }
      // 청취는 이 도구가 하지 않으므로 performed=false를 명시하고 실제 seed만 provenance에 남긴다.
      const result = { trackNumber: number, state: 'completed', requestId: job.id, requestKey: entry.requestKey, trackId: track.id, provider: 'cli', model: MODEL, seedReturned: track.seed ?? null, generatedAt: job.finishedAt ?? track.createdAt ?? null, localFile: outputPath, sha256: digest(bytes), listeningQa: { performed: false } };
      if (!(result.seedReturned === null || typeof result.seedReturned === 'string' || Number.isInteger(result.seedReturned))) fail('반환 seed 형식이 올바르지 않습니다.');
      manifest.results.push(result); manifest.results.sort((a, b) => a.trackNumber - b.trackNumber);
      await writeJson(manifestPath, manifest); entry.state = 'completed'; await writeJson(checkpointPath, state);
      log(`${String(number).padStart(2, '0')}번: 원본 저장 완료`);
    }
    return { completed: manifest.results.length, skipped: selected.length - pending.length, projectId: state.projectId, manifestPath };
  } finally {
    // 우리 실행이 만든 inode인 경우에만 lock을 지워 다른 소유자의 파일을 건드리지 않는다.
    await lock.close(); const current = await existing(lockPath);
    if (current?.dev === lockStat.dev && current.ino === lockStat.ino) await unlink(lockPath);
  }
}

/** CLI 옵션을 값으로만 읽는다. 범위와 중복 번호·origin 의미 검증은 runBatch에서 공통 적용한다. */
export function parseArguments(args) {
  const result = {};
  const names = { '--origin': 'origin', '--ui-origin': 'uiOrigin', '--plan': 'plan', '--state-dir': 'stateDir', '--project-id': 'projectId' };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]; const value = args[++index];
    if (flag === '--help') return { help: true };
    if (value === undefined || value.startsWith('--')) fail('각 옵션에 값을 지정하세요.');
    if (Object.hasOwn(names, flag)) result[names[flag]] = value;
    else if (flag === '--numbers') { if (!/^\d+(?:,\d+)*$/.test(value)) fail('--numbers는 1,2,3 형식입니다.'); result.numbers = value.split(',').map(Number); }
    else if (flag === '--timeout-seconds') { if (!/^\d+$/.test(value)) fail('대기 시간은 정수 초입니다.'); result.timeoutMs = Number(value) * 1000; }
    else fail('지원하지 않는 실행 옵션입니다.');
  }
  return result;
}
// import 시 제작을 시작하지 않는다. 직접 실행할 때만 인자를 읽고 종료 신호를 AbortSignal로 연결한다.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const stop = () => controller.abort(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) process.stdout.write('node harness/music/cli_batch_runner.mjs [--project-id ID] [--numbers 1,2] [--state-dir data/music] [--origin http://127.0.0.1:3000] [--ui-origin http://127.0.0.1:5174] [--timeout-seconds 1200] [--plan harness/music/track-plan.json]\n');
    else process.stdout.write(JSON.stringify(await runBatch({ ...options, signal: controller.signal }), null, 2) + '\n');
  } catch (error) {
    process.stderr.write(controller.signal.aborted ? '제작 대기를 중단했습니다. checkpoint에서 같은 작업을 재개할 수 있습니다.\n' : `제작 중단: ${error.message}\n`);
    process.exitCode = 1;
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
