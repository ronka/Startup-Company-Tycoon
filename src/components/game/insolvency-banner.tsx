import { Card } from '@/components/game/card';
import { ThemedText } from '@/components/themed-text';
import { BANKRUPTCY_FUSE_WEEKS } from '@/game/balance';

/** Loud warning shown on HQ while cash is negative — counts down to the bankruptcy fuse. */
export function InsolvencyBanner({ weeksInTheRed }: { weeksInTheRed: number }) {
  const weeksToLive = Math.max(1, BANKRUPTCY_FUSE_WEEKS - weeksInTheRed);

  return (
    <Card tone="alert">
      <ThemedText type="smallBold" themeColor="danger">
        INSOLVENT — {weeksToLive} {weeksToLive === 1 ? 'week' : 'weeks'} to live
      </ThemedText>
    </Card>
  );
}
