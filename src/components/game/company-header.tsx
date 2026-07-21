import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { FocusId, Stage } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { FOCUS_LABEL, STAGE_LABEL } from '@/lib/strategy-copy';

/** Up to two initials from the company name — "Nimbus Labs" → "NL". */
function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/** Identity block at the top of HQ: avatar, company name, stage · focus. */
export function CompanyHeader({ name, stage, focus }: { name: string; stage: Stage; focus: FocusId }) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
        <ThemedText type="smallBold">{initialsFor(name)}</ThemedText>
      </View>
      <View style={styles.text}>
        <ThemedText type="sheetTitle" numberOfLines={1}>
          {name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {STAGE_LABEL[stage]} · {FOCUS_LABEL[focus]}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
});
