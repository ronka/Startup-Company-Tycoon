import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { LEGAL_LINK_LABELS, openLegalLink, type LegalLink } from '@/lib/open-legal-link';

const DEFAULT_LINKS: LegalLink[] = ['privacy', 'terms'];

/**
 * The compact privacy/terms footer that sits under a paywall. App Review reads
 * a purchase screen as a whole: the price, what it buys, how to restore it, and
 * the terms it's sold under all need to be reachable from that one screen.
 */
export function LegalLinksRow({
  source,
  links = DEFAULT_LINKS,
}: {
  source: string;
  links?: LegalLink[];
}) {
  return (
    <View style={styles.row}>
      {links.map((link, index) => (
        <View key={link} style={styles.item}>
          {index > 0 ? (
            <ThemedText type="small" themeColor="textMuted">
              ·
            </ThemedText>
          ) : null}
          <Pressable
            onPress={() => openLegalLink(link, source)}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={LEGAL_LINK_LABELS[link]}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
              {LEGAL_LINK_LABELS[link]}
            </ThemedText>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  label: {
    textDecorationLine: 'underline',
  },
});
