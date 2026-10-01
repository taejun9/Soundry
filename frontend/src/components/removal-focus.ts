/**
 * 즐겨찾기 해제처럼 버튼 자체가 목록에서 사라지는 경우의 포커스 복구.
 * 비동기 DOM 갱신 중 사용자가 다른 조작으로 이동했다면 그 포커스를 빼앗지 않는다.
 */
import { nextTick } from 'vue';
type FocusTarget = Pick<HTMLElement, 'isConnected' | 'focus'>;

/** Restore a removed control only when focus was not intentionally moved elsewhere. */
export async function restoreRemovedControlFocus(
  control: FocusTarget,
  destination: () => FocusTarget | null,
  environment: { readonly activeElement: unknown; readonly body: unknown } = document,
): Promise<void> {
  await nextTick();
  if (control.isConnected) return;
  const current = environment.activeElement;
  if (current !== null && current !== environment.body && current !== control) return;
  const target = destination();
  if (target?.isConnected) target.focus({ preventScroll: true });
}
