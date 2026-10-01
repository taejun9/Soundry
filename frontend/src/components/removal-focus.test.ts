import { describe, expect, it, vi } from 'vitest';
import { restoreRemovedControlFocus } from './removal-focus';
function target(isConnected = true) { return { isConnected, focus: vi.fn() }; }
describe('focus after a list item disappears', () => {
  it('waits until the DOM update before focusing the surviving list heading', async () => {
    const button = target(); const heading = target(); const body = {};
    const environment = { activeElement: button as unknown, body };
    const restoration = restoreRemovedControlFocus(button, () => heading, environment);
    expect(heading.focus).not.toHaveBeenCalled();
    button.isConnected = false; environment.activeElement = body;
    await restoration;
    expect(heading.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it('does not steal focus if the user moves to another control while the DOM is updating', async () => {
    const button = target(); const heading = target(); const body = {};
    const environment = { activeElement: button as unknown, body };
    const restoration = restoreRemovedControlFocus(button, () => heading, environment);
    button.isConnected = false; environment.activeElement = target();
    await restoration; expect(heading.focus).not.toHaveBeenCalled();
  });
  it('does not focus a disconnected heading after navigation or move focus from a surviving button', async () => {
    const heading = target(false); const body = {};
    await restoreRemovedControlFocus(target(false), () => heading, { activeElement: body, body });
    expect(heading.focus).not.toHaveBeenCalled();
    const connectedHeading = target();
    await restoreRemovedControlFocus(target(), () => connectedHeading, { activeElement: body, body });
    expect(connectedHeading.focus).not.toHaveBeenCalled();
  });
});
