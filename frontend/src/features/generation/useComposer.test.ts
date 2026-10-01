/**
 * 탭 메모리 초안의 프로젝트 격리, 공급자 변경, 과거 입력 재사용을 검증한다.
 * Vue scope 종료를 화면 이탈로 사용하고 공급자 기본값·원본 입력·프롬프트 보존을 함께 확인한다.
 */
import { effectScope, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import type { ProviderSummary } from '../../../../shared/contracts';
import { forgetProjectDraft, useComposer } from './useComposer';

const mock: ProviderSummary = { id: 'mock', model: 'demo-fixture', isMock: true, configured: true, generationEnabled: false, notice: 'Demo', capabilities: { modes: ['instrumental'], settings: [], maxVariations: 4, seedSupported: false, canCancelRemote: false } };

const cli: ProviderSummary = { id: 'cli', model: 'test-composer', isMock: false, configured: true, generationEnabled: true, notice: 'AI composition and local synthesis', capabilities: { modes: ['instrumental'], settings: ['genre', 'mood', 'bpm', 'durationSeconds', 'seed'], maxVariations: 4, seedSupported: true, canCancelRemote: false, bpmRange: { min: 40, max: 220 }, durationRangeSeconds: { min: 90, max: 180 } } };

describe('tab-memory composer lifecycle', () => {
  it('keeps CLI defaults on the server and validates actual seed/range boundaries before submission', () => {
    const scope = effectScope(); const composer = scope.run(() => useComposer('cli-input', ref(cli)))!;
    composer.draft.prompt = 'A layered original instrumental';
    expect(composer.validate()).toEqual({ prompt: composer.draft.prompt, settings: {}, variationCount: 2 });
    Object.assign(composer.draft, { mode: 'instrumental', genre: 'Jazz', mood: 'Warm', bpm: '220', durationSeconds: '180', seed: 's'.repeat(64), variationCount: 4 });
    expect(composer.validate()?.settings).toEqual({ mode: 'instrumental', genre: 'Jazz', mood: 'Warm', bpm: 220, durationSeconds: 180, seed: 's'.repeat(64) });
    composer.draft.seed += 's';
    expect(composer.validate()).toBeNull(); expect(composer.errors.value.seed).toContain('64');
    composer.draft.seed = ''; composer.draft.durationSeconds = '89'; composer.draft.bpm = '221'; composer.draft.mode = 'vocal';
    expect(composer.validate()).toBeNull(); expect(Object.keys(composer.errors.value).sort()).toEqual(['bpm', 'durationSeconds', 'mode']);
    scope.stop(); forgetProjectDraft('cli-input');
  });

  it('clears a legacy long seed when the provider changes to CLI or its input is reused, while preserving the original idea', async () => {
    const provider = ref<ProviderSummary>({ ...cli, id: 'other' });
    const scope = effectScope(); const composer = scope.run(() => useComposer('cli-legacy', provider))!;
    composer.draft.prompt = 'Keep this idea'; composer.draft.seed = 's'.repeat(100);
    expect(composer.validate()?.settings.seed).toHaveLength(100);
    provider.value = cli; await nextTick();
    expect(composer.draft.seed).toBe(''); expect(composer.draft.prompt).toBe('Keep this idea'); expect(composer.capabilityNotice.value).toBeTruthy();
    composer.reuse({ generationId: 'past', prompt: 'Previous idea', settings: { seed: 's'.repeat(65), durationSeconds: 30 }, variationCount: 2 });
    expect(composer.validate()?.settings).toEqual({}); expect(composer.sourceGenerationId.value).toBe('past'); expect(composer.capabilityNotice.value).toContain('초기화');
    scope.stop(); forgetProjectDraft('cli-legacy');
  });

  it('disables an otherwise valid CLI draft until installation and login are ready', async () => {
    const provider = ref<ProviderSummary>({ ...cli, configured: false, generationEnabled: false });
    const scope = effectScope(); const composer = scope.run(() => useComposer('cli-unavailable', provider))!;
    composer.draft.prompt = 'Keep this private draft';
    expect(composer.readyToGenerate.value).toBe(false);
    provider.value = cli; await nextTick(); expect(composer.readyToGenerate.value).toBe(true);
    expect(composer.draft.prompt).toBe('Keep this private draft');
    scope.stop(); forgetProjectDraft('cli-unavailable');
  });
  it('restores only the selected project and forgets a deleted project', () => {
    const provider = ref<ProviderSummary | null>(mock);
    const firstScope = effectScope();
    const first = firstScope.run(() => useComposer('draft-project-a', provider))!;
    first.draft.prompt = 'Private idea in memory';
    firstScope.stop();
    const secondScope = effectScope();
    const second = secondScope.run(() => useComposer('draft-project-b', provider))!;
    expect(second.draft.prompt).toBe('');
    secondScope.stop();
    const restoredScope = effectScope();
    const restored = restoredScope.run(() => useComposer('draft-project-a', provider))!;
    expect(restored.restored).toBe(true);
    expect(restored.draft.prompt).toBe('Private idea in memory');
    expect(restored.readyToGenerate.value).toBe(false);
    restoredScope.stop();
    forgetProjectDraft('draft-project-a');
    const cleanScope = effectScope();
    const clean = cleanScope.run(() => useComposer('draft-project-a', provider))!;
    expect(clean.draft.prompt).toBe('');
    cleanScope.stop();
    forgetProjectDraft('draft-project-a');
    forgetProjectDraft('draft-project-b');
  });

  it('announces capability changes without overwriting the draft prompt', async () => {
    const provider = ref<ProviderSummary | null>(null);
    const scope = effectScope();
    const composer = scope.run(() => useComposer('draft-capabilities', provider))!;
    composer.draft.prompt = 'Preserve this idea';
    composer.draft.genre = 'Jazz';
    composer.draft.variationCount = 4;
    provider.value = { ...mock, capabilities: { ...mock.capabilities, maxVariations: 1 } };
    await nextTick();
    expect(composer.draft.prompt).toBe('Preserve this idea');
    expect(composer.draft.genre).toBe('');
    expect(composer.draft.variationCount).toBe(1);
    expect(composer.capabilityNotice.value).toContain('프롬프트는 그대로');
    expect(composer.validate()?.settings).toEqual({});
    scope.stop();
    forgetProjectDraft('draft-capabilities');
  });
  it('restores requested settings and source ancestry without mutating the original, then caches them together', () => {
    const provider = ref<ProviderSummary | null>({ ...mock, capabilities: { ...mock.capabilities, settings: ['genre', 'bpm', 'durationSeconds'], bpmRange: { min: 60, max: 180 }, durationRangeSeconds: { min: 30, max: 180 }, maxVariations: 3 } });
    const scope = effectScope(); const composer = scope.run(() => useComposer('reused-draft', provider))!;
    const original = { generationId: 'original-job', prompt: 'Original idea', settings: { mode: 'vocal' as const, genre: 'Jazz', bpm: 95.5, durationSeconds: 120, seed: 'unsupported' }, variationCount: 4 };
    expect(composer.hasDraft.value).toBe(false);
    expect(composer.reuse(original)).toBe(true);
    expect(composer.sourceGenerationId.value).toBe('original-job');
    expect(composer.validate()).toEqual({ prompt: 'Original idea', settings: { genre: 'Jazz', bpm: 95.5, durationSeconds: 120 }, variationCount: 2 });
    expect(composer.capabilityNotice.value).toContain('지원하지 않는');
    expect(original.settings.seed).toBe('unsupported'); expect(original.variationCount).toBe(4);
    expect(composer.hasDraft.value).toBe(true); scope.stop();
    const nextScope = effectScope(); const restored = nextScope.run(() => useComposer('reused-draft', provider))!;
    expect(restored.sourceGenerationId.value).toBe('original-job'); expect(restored.draft.bpm).toBe('95.5');
    nextScope.stop(); forgetProjectDraft('reused-draft');
  });

  it('does not replace existing input before provider capabilities can be checked', () => {
    const scope = effectScope(); const composer = scope.run(() => useComposer('reuse-no-provider', ref(null)))!;
    composer.draft.prompt = 'Current work';
    expect(composer.reuse({ generationId: 'old', prompt: 'Old idea', settings: {}, variationCount: 1 })).toBe(false);
    expect(composer.draft.prompt).toBe('Current work'); expect(composer.sourceGenerationId.value).toBeNull();
    scope.stop(); forgetProjectDraft('reuse-no-provider');
  });

});
