import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { restoreDialogFocus } from './dialog-focus';

function target(name: string, visits: string[], isConnected = true) {
  return { isConnected, focus: () => { visits.push(name); } };
}

describe('dialog focus after a confirmed edit', () => {
  it('resolves the confirmed textarea after unmount and never restores over it on a later tick', async () => {
    const visits: string[] = [];
    const opener = target('insert example', visits);
    const textarea = target('prompt', visits);
    let confirmed = false;
    const restoration = restoreDialogFocus(opener, () => confirmed ? textarea : null);
    confirmed = true;
    expect(visits).toEqual([]);
    await restoration;
    await nextTick();
    expect(visits).toEqual(['prompt']);
  });

  it('returns a cancelled confirmation to its opener', async () => {
    const visits: string[] = [];
    await restoreDialogFocus(target('insert example', visits), () => null);
    expect(visits).toEqual(['insert example']);
  });

  it('uses the surviving opener or main content when navigation removes the preferred field', async () => {
    const visits: string[] = [];
    const removedField = target('removed prompt', visits, false);
    await restoreDialogFocus(target('opener', visits), () => removedField);
    await restoreDialogFocus(target('removed opener', visits, false), () => removedField, () => target('main', visits));
    expect(visits).toEqual(['opener', 'main']);
  });
  it('returns a confirmed removal to the library heading when its opening card no longer exists', async () => {
    const visits: string[] = [];
    const opener = target('delete track button', visits);
    const heading = target('favorite library heading', visits);
    let deletionConfirmed = false;
    const restoration = restoreDialogFocus(opener, () => deletionConfirmed ? heading : null, () => target('main', visits));
    deletionConfirmed = true; opener.isConnected = false;
    await restoration;
    expect(visits).toEqual(['favorite library heading']);
  });

});
