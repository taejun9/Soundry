/**
 * 대화상자가 사라진 뒤 한 곳으로 키보드 포커스를 복원한다.
 * DOM 갱신 후 우선 대상, 열었던 버튼, 남아 있는 본문 순으로 확인해 사라진 노드를 선택하지 않는다.
 */
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
