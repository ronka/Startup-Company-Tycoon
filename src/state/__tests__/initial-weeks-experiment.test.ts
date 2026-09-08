import { describe, expect, it } from 'vitest';

import {
  createInitialWeeksEnrollment,
  INITIAL_WEEKS_EXPERIMENT_KEY,
  initialWeeksForVariant,
  normalizeInitialWeeksVariant,
  parseInitialWeeksEnrollment,
} from '../initial-weeks-experiment';

describe('initial weeks experiment', () => {
  it('maps only the two configured PostHog variants', () => {
    expect(normalizeInitialWeeksVariant('control')).toBe('control');
    expect(normalizeInitialWeeksVariant('test')).toBe('test');
    expect(normalizeInitialWeeksVariant(true)).toBeNull();
    expect(normalizeInitialWeeksVariant('treatment')).toBeNull();
  });

  it('maps control to five weeks and test to ten', () => {
    expect(initialWeeksForVariant('control')).toBe(5);
    expect(initialWeeksForVariant('test')).toBe(10);
  });

  it('round-trips a durable assignment', () => {
    const assigned = createInitialWeeksEnrollment(
      'test',
      new Date('2026-09-08T10:00:00.000Z'),
    );
    expect(parseInitialWeeksEnrollment(JSON.stringify(assigned))).toEqual(
      assigned,
    );
    expect(assigned.experimentKey).toBe(INITIAL_WEEKS_EXPERIMENT_KEY);
    expect(assigned.grantApplied).toBe(true);
  });

  it('rejects malformed or stale assignments', () => {
    expect(parseInitialWeeksEnrollment(null)).toBeNull();
    expect(parseInitialWeeksEnrollment('{broken')).toBeNull();
    expect(
      parseInitialWeeksEnrollment(
        JSON.stringify({
          experimentKey: INITIAL_WEEKS_EXPERIMENT_KEY,
          variant: 'test',
          assignedAt: '2026-09-08T10:00:00.000Z',
          initialWeeks: 5,
          grantApplied: true,
        }),
      ),
    ).toBeNull();
  });
});
