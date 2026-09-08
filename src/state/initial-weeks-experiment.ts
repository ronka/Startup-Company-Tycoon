import { WEEKS_PER_DAY } from './week-budget';

/** PostHog experiment/feature-flag key. Keep in sync with the live PostHog experiment. */
export const INITIAL_WEEKS_EXPERIMENT_KEY = 'initial-free-weeks-v1';
/** Survives app resets so one install can never collect the treatment grant twice. */
export const INITIAL_WEEKS_EXPERIMENT_STORAGE_KEY =
  'startup-tycoon/experiment/initial-free-weeks-v1';

export type InitialWeeksVariant = 'control' | 'test';

export interface InitialWeeksEnrollment {
  experimentKey: typeof INITIAL_WEEKS_EXPERIMENT_KEY;
  variant: InitialWeeksVariant;
  assignedAt: string;
  initialWeeks: number;
  grantApplied: true;
}

export function normalizeInitialWeeksVariant(
  value: unknown,
): InitialWeeksVariant | null {
  return value === 'control' || value === 'test' ? value : null;
}

export function initialWeeksForVariant(variant: InitialWeeksVariant): number {
  return variant === 'test' ? 10 : WEEKS_PER_DAY;
}

export function createInitialWeeksEnrollment(
  variant: InitialWeeksVariant,
  now: Date,
): InitialWeeksEnrollment {
  return {
    experimentKey: INITIAL_WEEKS_EXPERIMENT_KEY,
    variant,
    assignedAt: now.toISOString(),
    initialWeeks: initialWeeksForVariant(variant),
    grantApplied: true,
  };
}

export function parseInitialWeeksEnrollment(
  raw: string | null,
): InitialWeeksEnrollment | null {
  if (!raw) return null;
  try {
    const candidate = JSON.parse(raw) as Partial<InitialWeeksEnrollment>;
    const variant = normalizeInitialWeeksVariant(candidate.variant);
    if (
      candidate.experimentKey !== INITIAL_WEEKS_EXPERIMENT_KEY ||
      variant === null ||
      candidate.grantApplied !== true ||
      candidate.initialWeeks !== initialWeeksForVariant(variant) ||
      typeof candidate.assignedAt !== 'string'
    ) {
      return null;
    }
    return candidate as InitialWeeksEnrollment;
  } catch {
    return null;
  }
}
