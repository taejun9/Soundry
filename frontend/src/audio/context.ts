/**
 * App이 만든 플레이어를 하위 화면에서 타입 안전하게 공유하는 provide/inject 경계.
 * 주입 누락은 새 플레이어 생성으로 숨기지 않고 오류로 드러내어 동시 재생을 예방한다.
 */
import { inject, type InjectionKey } from 'vue';
import type { AudioController } from './controller';
export const audioControllerKey: InjectionKey<AudioController> = Symbol('soundry-audio');
/** 컴포넌트가 App의 controller를 공유하게 강제한다. 주입 실패 시 조용히 새 인스턴스를 만들지 않는다. */
export function useAudioPlayer(): AudioController {
  const controller = inject(audioControllerKey);
  if (!controller) throw new Error('AUDIO_CONTROLLER_UNAVAILABLE');
  return controller;
}
