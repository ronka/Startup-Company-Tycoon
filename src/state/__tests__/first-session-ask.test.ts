import { describe, expect, it } from 'vitest';

import { FIRST_SESSION_ASK_WEEK, firstSessionAskDue, type FirstSessionAskInput } from '../first-session-ask';

const due: FirstSessionAskInput = {
  week: FIRST_SESSION_ASK_WEEK,
  recapSettled: true,
  permissionUnspent: true,
  softAskShown: false,
  isWeb: false,
  otherSurfaceBusy: false,
  atWall: false,
};

describe('firstSessionAskDue', () => {
  it('is due at the ask week once the recap has settled and nothing else is up', () => {
    expect(firstSessionAskDue(due)).toBe(true);
  });

  it('waits until the ask week', () => {
    expect(firstSessionAskDue({ ...due, week: FIRST_SESSION_ASK_WEEK - 1 })).toBe(false);
  });

  it('stays due on later weeks if the ask week passed without a chance to ask', () => {
    expect(firstSessionAskDue({ ...due, week: FIRST_SESSION_ASK_WEEK + 4 })).toBe(true);
  });

  it('never asks once the OS permission shot is spent', () => {
    expect(firstSessionAskDue({ ...due, permissionUnspent: false })).toBe(false);
  });

  it('is one-time: never asks again after the soft ask was shown', () => {
    expect(firstSessionAskDue({ ...due, softAskShown: true })).toBe(false);
  });

  it('treats unresolved reads as "not yet", not as a yes', () => {
    expect(firstSessionAskDue({ ...due, permissionUnspent: null })).toBe(false);
    expect(firstSessionAskDue({ ...due, softAskShown: null })).toBe(false);
  });

  it('waits on the recap, other surfaces (incl. the week-5 leaderboard ask), and the wall', () => {
    expect(firstSessionAskDue({ ...due, recapSettled: false })).toBe(false);
    expect(firstSessionAskDue({ ...due, otherSurfaceBusy: true })).toBe(false);
    expect(firstSessionAskDue({ ...due, atWall: true })).toBe(false);
  });

  it('never asks on web', () => {
    expect(firstSessionAskDue({ ...due, isWeb: true })).toBe(false);
  });
});
