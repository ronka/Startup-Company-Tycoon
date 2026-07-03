import { ProgressBar } from '@/components/game/progress-bar';
import { MORALE_ATTRITION_THRESHOLD, MORALE_CRISIS_THRESHOLD } from '@/game/balance';

function moraleColor(pct: number): string {
  if (pct < 30) return '#ef4444';
  if (pct < 60) return '#f59e0b';
  return '#22c55e';
}

/** Marks the two documented danger thresholds: below `MORALE_CRISIS_THRESHOLD` a
 * productivity penalty kicks in; below `MORALE_ATTRITION_THRESHOLD` a random hire can quit. */
export function MoraleBar({ morale }: { morale: number }) {
  return (
    <ProgressBar
      percent={morale}
      color={moraleColor(morale)}
      markers={[MORALE_CRISIS_THRESHOLD, MORALE_ATTRITION_THRESHOLD]}
    />
  );
}
