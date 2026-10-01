import { onScopeDispose, ref } from 'vue';
import type { TrackSummary } from '../../../../shared/contracts';
import type { AudioController } from '../../audio/controller';
import { updateTrack } from '../../api/tracks';
import { ApiError, errorMessage } from '../../api/client';

export function useFavorites(saved: (track: TrackSummary) => void, player: Pick<AudioController, 'updateTrack'>, update = updateTrack) {
  const pending = ref(new Set<string>());
  const errors = ref<Record<string, string>>({});
  const controllers = new Map<string, AbortController>();
  let active = true;
  let errorVersion = 0;
  const errorVersions = new Map<string, number>();
  async function toggle(track: TrackSummary) {
    if (!active || pending.value.has(track.id)) return;
    const controller = new AbortController(); controllers.set(track.id, controller);
    pending.value.add(track.id); delete errors.value[track.id]; errorVersions.delete(track.id);
    try {
      const changed = await update(track.id, track.projectId, { favorite: !track.favorite }, controller.signal);
      if (!active) return;
      player.updateTrack(changed);
      saved(changed);
    } catch (reason) {
      if (active) {
        errors.value[track.id] = reason instanceof ApiError && reason.status === 0
          ? '즐겨찾기 저장 결과를 확인하지 못했어요. 목록을 새로고침해 반영 여부를 확인해 주세요.' : errorMessage(reason);
        errorVersions.set(track.id, ++errorVersion);
      }
    } finally { controllers.delete(track.id); if (active) pending.value.delete(track.id); }
  }
  function beginConfirmation() {
    const observed = new Map(errorVersions);
    return (tracks: readonly TrackSummary[], completeFavoriteList = false) => {
      if (!active) return;
      const confirmedIds = new Set(tracks.map(track => track.id));
      for (const [id, version] of observed) {
        if ((completeFavoriteList || confirmedIds.has(id)) && version === errorVersions.get(id)) {
          delete errors.value[id]; errorVersions.delete(id);
        }
      }
    };
  }
  onScopeDispose(() => { active = false; controllers.forEach(controller => controller.abort()); controllers.clear(); });
  return { pending, errors, toggle, beginConfirmation };
}
