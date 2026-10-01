import { deleteProject } from '../../api/projects';
import type { AudioController } from '../../audio/controller';

/** Called only after deletion is confirmed, before dispatching the destructive request. */
export function deleteProjectWithPlayback(id: string, signal: AbortSignal, player: Pick<AudioController, 'clearProject'>) {
  player.clearProject(id);
  return deleteProject(id, signal);
}
