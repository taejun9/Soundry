import { inject, type InjectionKey } from 'vue';
import type { AudioController } from './controller';
export const audioControllerKey: InjectionKey<AudioController> = Symbol('soundry-audio');
export function useAudioPlayer(): AudioController {
  const controller = inject(audioControllerKey);
  if (!controller) throw new Error('AUDIO_CONTROLLER_UNAVAILABLE');
  return controller;
}
