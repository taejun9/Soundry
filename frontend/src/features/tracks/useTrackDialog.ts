/**
 * 음원 편집창의 최신 상세 조회, 이름 검증, 확정 삭제를 담당한다.
 * 이름 변경은 재생 위치를 유지하고 삭제는 요청 전에 재생을 멈추며, 닫힌 창으로 돌아온 응답은 반영하지 않는다.
 */
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
  /** 동시에 요청한 상세 중 마지막 응답만 제목 초안을 초기화할 수 있다. */
  async function load() {
    const current = ++sequence; loading.value = true; error.value = '';
    try { const value = await api.getTrack(id, projectId, controller.signal); if (active && sequence === current) { detail.value = value; title.value = value.title; } }
    catch (reason) { if (active && sequence === current) error.value = errorMessage(reason); }
    finally { if (active && sequence === current) loading.value = false; }
  }
  /** 이름을 trim/검증한 뒤 서버 확정값만 플레이어 표시와 부모 화면에 전달한다. */
  async function save() {
    if (!active || busy.value || !detail.value) return;
    const name = title.value.trim();
    if (!name || name.length > 120 || name.includes('\0')) { fieldError.value = '음원 이름은 사용할 수 없는 문자 없이 1–120자로 입력해 주세요.'; return; }
    busy.value = true; error.value = ''; fieldError.value = '';
    try { const value = await api.updateTrack(id, projectId, { title: name }, controller.signal); if (active) { player.updateTrack(value); return value; } }
    catch (reason) { if (active) error.value = mutationError(reason); }
    finally { if (active) busy.value = false; }
  }
  /** 삭제 확인 뒤 API 전송 전에 대상 재생을 멈춰 응답 유실 시에도 삭제된 오디오를 계속 듣지 않게 한다. */
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
/** status 0은 쓰기 실패 확정이 아니므로 재전송 대신 이력 재조회로 반영 여부를 확인하도록 안내한다. */
function mutationError(reason: unknown) { return reason instanceof ApiError && reason.status === 0 ? '변경 결과를 확인하지 못했어요. 창을 닫고 생성 이력을 새로고침해 반영 여부를 확인해 주세요.' : errorMessage(reason); }
