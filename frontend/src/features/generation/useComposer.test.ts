import { effectScope, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import type { ProviderSummary } from '../../../../shared/contracts';
import { forgetProjectDraft, useComposer } from './useComposer';

const mock: ProviderSummary = { id: 'mock', model: 'demo-fixture', isMock: true, configured: true, generationEnabled: false, notice: 'Demo', capabilities: { modes: ['instrumental'], settings: [], maxVariations: 4, seedSupported: false, canCancelRemote: false } };

describe('tab-memory composer lifecycle', () => {
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
});
