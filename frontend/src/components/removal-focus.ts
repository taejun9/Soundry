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
