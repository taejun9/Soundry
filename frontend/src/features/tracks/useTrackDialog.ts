import { onScopeDispose, ref } from 'vue';
import type { AudioController } from '../../audio/controller';
import * as trackApi from '../../api/tracks';
import { ApiError, errorMessage } from '../../api/client';
import type { TrackDetail } from '../../../../shared/contracts';

export function useTrackDialog(id: string, projectId: string, player: Pick<AudioController, 'clearTrack' | 'updateTrack'>, api = trackApi) {
  const detail = ref<TrackDetail | null>(null);
  const title = ref(''); const loading = ref(false); const busy = ref(false); const error = ref(''); const fieldError = ref('');
  let active = true; let sequence = 0;
  const controller = new AbortController();
  async function load() {
    const current = ++sequence; loading.value = true; error.value = '';
    try { const value = await api.getTrack(id, projectId, controller.signal); if (active && sequence === current) { detail.value = value; title.value = value.title; } }
    catch (reason) { if (active && sequence === current) error.value = errorMessage(reason); }
    finally { if (active && sequence === current) loading.value = false; }
  }
  async function save() {
    if (!active || busy.value || !detail.value) return;
    const name = title.value.trim();
    if (!name || name.length > 120 || name.includes('\0')) { fieldError.value = '음원 이름은 사용할 수 없는 문자 없이 1–120자로 입력해 주세요.'; return; }
    busy.value = true; error.value = ''; fieldError.value = '';
    try { const value = await api.updateTrack(id, projectId, { title: name }, controller.signal); if (active) { player.updateTrack(value); return value; } }
    catch (reason) { if (active) error.value = mutationError(reason); }
    finally { if (active) busy.value = false; }
  }
  async function remove() {
    if (!active || busy.value || !detail.value) return;
    busy.value = true; error.value = '';
    // Stop before the request: response loss or navigation must not leave deleted audio playing.
    player.clearTrack(id);
    try { const result = await api.deleteTrack(id, controller.signal); if (active) return result; }
    catch (reason) { if (active) error.value = mutationError(reason); }
    finally { if (active) busy.value = false; }
  }
  onScopeDispose(() => { active = false; sequence++; controller.abort(); });
  return { detail, title, loading, busy, error, fieldError, load, save, remove };
}
function mutationError(reason: unknown) { return reason instanceof ApiError && reason.status === 0 ? '변경 결과를 확인하지 못했어요. 창을 닫고 생성 이력을 새로고침해 반영 여부를 확인해 주세요.' : errorMessage(reason); }
