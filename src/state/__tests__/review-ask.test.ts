import { describe, expect, it } from 'vitest';

import {
  MAX_REVIEW_ASKS,
  REVIEW_COOLDOWN_DAYS,
  canAskForReview,
  initialReviewAskRecord,
  notificationAskSettled,
  parseReviewAskRecord,
  recordReviewAsk,
  reviewAskBlockedBy,
} from '../review-ask';

const DAY_MS = 24 * 60 * 60 * 1000;
/** An arbitrary fixed "now" — 2026-01-01T00:00:00Z — so nothing here reads a clock. */
const T0 = 1_767_225_600_000;

describe('canAskForReview', () => {
  it('allows the first ask from a fresh record', () => {
    expect(canAskForReview(initialReviewAskRecord(), T0)).toBe(true);
  });

  it('blocks a second ask inside the cooldown', () => {
    const after = recordReviewAsk(initialReviewAskRecord(), T0);
    const oneDayShort = T0 + (REVIEW_COOLDOWN_DAYS - 1) * DAY_MS;
    expect(reviewAskBlockedBy(after, oneDayShort)).toBe('cooldown');
  });

  it('allows a second ask once the cooldown has elapsed', () => {
    const after = recordReviewAsk(initialReviewAskRecord(), T0);
    expect(canAskForReview(after, T0 + (REVIEW_COOLDOWN_DAYS + 1) * DAY_MS)).toBe(true);
  });

  it('blocks forever once the lifetime cap is spent, however long we wait', () => {
    let record = initialReviewAskRecord();
    for (let i = 0; i < MAX_REVIEW_ASKS; i += 1) {
      record = recordReviewAsk(record, T0 + i * REVIEW_COOLDOWN_DAYS * 2 * DAY_MS);
    }
    expect(record.askCount).toBe(MAX_REVIEW_ASKS);
    // Ten years on, still capped — the budget is a lifetime one, not a rolling window.
    expect(reviewAskBlockedBy(record, T0 + 3650 * DAY_MS)).toBe('cap_reached');
  });

  it('reports the cap before the cooldown when both apply', () => {
    const record = { askCount: MAX_REVIEW_ASKS, lastAskedAtMs: T0 };
    expect(reviewAskBlockedBy(record, T0 + DAY_MS)).toBe('cap_reached');
  });
});

describe('parseReviewAskRecord', () => {
  it('round-trips a written record', () => {
    const record = recordReviewAsk(initialReviewAskRecord(), T0);
    expect(parseReviewAskRecord(JSON.stringify(record))).toEqual(record);
  });

  it('treats missing storage as a fresh record', () => {
    expect(parseReviewAskRecord(null)).toEqual(initialReviewAskRecord());
  });

  // Degrading to "ask once more" rather than throwing is deliberate: a hard failure
  // would disable the feature silently, and there is no OS callback to notice with.
  it.each(['not json at all', '[]', 'null', '{"askCount":"two"}', '{"lastAskedAtMs":"yesterday"}'])(
    'degrades corrupt storage (%s) to an askable record',
    (raw) => {
      const record = parseReviewAskRecord(raw);
      expect(canAskForReview(record, T0)).toBe(true);
    },
  );
});

describe('notificationAskSettled', () => {
  // Not "never asked, so go ahead" — the notification dialog mounts on the very
  // wall dismissal the review ask would use, so "never" means "about to, right here".
  it('is unsettled when the permission shot has never been spent', () => {
    expect(notificationAskSettled(null, '2026-07-26')).toBe(false);
  });

  it('is unsettled on the same day the shot was spent', () => {
    expect(notificationAskSettled('2026-07-26', '2026-07-26')).toBe(false);
  });

  it('is settled once a day has passed', () => {
    expect(notificationAskSettled('2026-07-25', '2026-07-26')).toBe(true);
  });

  it('settles installs backfilled with the legacy sentinel day', () => {
    expect(notificationAskSettled('1970-01-01', '2026-07-26')).toBe(true);
  });

  // The partial-write case: `notificationAskSpentOnDateKey` returns null whenever
  // the requested flag isn't set, however stale a day key it finds, so an
  // interrupted write can never read as "spent long ago" and open the same-day
  // collision this function exists to prevent.
  it('is unsettled for the null an interrupted permission write produces', () => {
    expect(notificationAskSettled(null, '1970-01-02')).toBe(false);
  });

  // dateKey is YYYY-MM-DD, so lexicographic ordering is chronological ordering —
  // including across month and year boundaries.
  it('orders correctly across month and year boundaries', () => {
    expect(notificationAskSettled('2026-07-31', '2026-08-01')).toBe(true);
    expect(notificationAskSettled('2026-12-31', '2027-01-01')).toBe(true);
    expect(notificationAskSettled('2027-01-01', '2026-12-31')).toBe(false);
  });
});
