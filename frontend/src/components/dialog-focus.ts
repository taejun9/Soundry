import { nextTick } from 'vue';

type FocusTarget = Pick<HTMLElement, 'isConnected' | 'focus'>;

/** Resolve one destination after the dialog unmounts, so callers cannot race its restoration. */
export async function restoreDialogFocus(
  opener: FocusTarget | null,
  preferred?: () => FocusTarget | null,
  fallback?: () => FocusTarget | null,
): Promise<void> {
  await nextTick();
  const destination = preferred?.();
  if (destination?.isConnected) destination.focus();
  else if (opener?.isConnected) opener.focus();
  else {
    const remaining = fallback?.();
    if (remaining?.isConnected) remaining.focus();
  }
}
