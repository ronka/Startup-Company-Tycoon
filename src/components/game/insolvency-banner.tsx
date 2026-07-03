import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { BANKRUPTCY_FUSE_WEEKS } from '@/game/balance';

/** Loud warning shown on HQ while cash is negative — counts down to the bankruptcy fuse. */
export function InsolvencyBanner({ weeksInTheRed }: { weeksInTheRed: number }) {
  const weeksToLive = Math.max(1, BANKRUPTCY_FUSE_WEEKS - weeksInTheRed);

  return (
    <ThemedView type="dangerBackground" style={styles.banner}>
      <ThemedText type="smallBold" themeColor="danger">
        INSOLVENT — {weeksToLive} {weeksToLive === 1 ? 'week' : 'weeks'} to live
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
});
