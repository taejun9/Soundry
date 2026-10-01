/**
 * 사용자가 확인한 프로젝트 삭제를 재생 제어와 연결한다.
 * DELETE 응답 유실이나 화면 이동에도 삭제 대상의 오디오가 계속 재생되지 않도록 요청 전에 비운다.
 */
import { deleteProject } from '../../api/projects';
import type { AudioController } from '../../audio/controller';

/** Called only after deletion is confirmed, before dispatching the destructive request. */
export function deleteProjectWithPlayback(id: string, signal: AbortSignal, player: Pick<AudioController, 'clearProject'>) {
  player.clearProject(id);
  return deleteProject(id, signal);
}
