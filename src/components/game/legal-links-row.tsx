import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { LEGAL_LINK_LABELS, openLegalLink, type LegalLink } from '@/lib/open-legal-link';

const DEFAULT_LINKS: LegalLink[] = ['privacy', 'terms'];

/**
 * Generous, because these are text links rather than buttons: a bare 18-20pt
 * line plus 8pt of slop lands well under the 44pt minimum tap target.
 */
export const LINK_HIT_SLOP = { top: 14, bottom: 14, left: 10, right: 10 };

/**
 * One legal link, wired to the canonical label and open-handler. Exported so a
 * footer that runs its links inline among other items (see `paywall-footer.tsx`)
 * gets the same wiring without rebuilding the row around them.
 */
export function LegalLinkText({
  link,
  source,
  type = 'small',
}: {
  link: LegalLink;
  source: string;
  type?: 'small' | 'footnote';
}) {
  return (
    <Pressable
      onPress={() => openLegalLink(link, source)}
      hitSlop={LINK_HIT_SLOP}
      accessibilityRole="link"
      accessibilityLabel={LEGAL_LINK_LABELS[link]}>
      <ThemedText type={type} themeColor={type === 'footnote' ? 'textMuted' : 'textSecondary'} style={styles.label}>
        {LEGAL_LINK_LABELS[link]}
      </ThemedText>
    </Pressable>
  );
}

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
          <LegalLinkText link={link} source={source} />
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
