/**
 * 음원별 즐겨찾기 쓰기와 불확실한 결과의 재확인을 관리한다.
 * 확정 응답만 목록·플레이어에 반영하며 서로 다른 음원의 요청과 오류는 독립적으로 유지한다.
 */
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
  /** 같은 음원의 중복 쓰기만 잠그고 성공한 서버 값으로 UI를 갱신한다. 결과 유실은 자동 반전/재시도하지 않는다. */
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
  /** 읽기 시작 시의 오류 버전을 캡처한다. 그 뒤 생긴 새 쓰기 오류는 오래된 읽기가 지울 수 없다. */
  function beginConfirmation() {
    // 요청 이후 생긴 오류와 구분하도록 읽기 시점의 오류 version만 보관한다.
    const observed = new Map(errorVersions);
    return (tracks: readonly TrackSummary[], completeFavoriteList = false) => {
      if (!active) return;
      const confirmedIds = new Set(tracks.map(track => track.id));
      for (const [id, version] of observed) {
        // 전체 즐겨찾기 목록에서 없어진 경우도 해제 확인이다. 부분 페이지의 부재는 확인 근거가 아니다.
        if ((completeFavoriteList || confirmedIds.has(id)) && version === errorVersions.get(id)) {
          delete errors.value[id]; errorVersions.delete(id);
        }
      }
    };
  }
  onScopeDispose(() => { active = false; controllers.forEach(controller => controller.abort()); controllers.clear(); });
  return { pending, errors, toggle, beginConfirmation };
}
