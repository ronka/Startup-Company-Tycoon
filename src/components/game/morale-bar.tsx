import { ProgressBar } from '@/components/game/progress-bar';
import { MORALE_ATTRITION_THRESHOLD, MORALE_CRISIS_THRESHOLD } from '@/game/balance';
import { useTheme } from '@/hooks/use-theme';
import { moraleTone } from '@/lib/stat-colors';

/** Marks the two documented danger thresholds: below `MORALE_CRISIS_THRESHOLD` a
 * productivity penalty kicks in; below `MORALE_ATTRITION_THRESHOLD` a random hire can quit. */
export function MoraleBar({ morale }: { morale: number }) {
  const theme = useTheme();
  return (
    <ProgressBar
      percent={morale}
      color={theme[moraleTone(morale)]}
      markers={[MORALE_CRISIS_THRESHOLD, MORALE_ATTRITION_THRESHOLD]}
    />
  );
}
