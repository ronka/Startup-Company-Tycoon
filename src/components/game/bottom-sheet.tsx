import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Overlay, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Shared bottom-sheet shell for every in-game modal: grabber, optional ✕, and
 * a scrollable body pinned to the bottom of the screen.
 *
 * Deliberately a plain RN `<Modal animationType="slide">` with no mount/unmount
 * timers of its own — the gates that keep two sheets from presenting into each
 * other's dismiss frame live in `game-chrome.tsx` and `game-store.tsx`
 * (see `docs/bug-stuck-decision-modal.md`), and adding delay here would race them.
 *
 * `dismissible` is off for sheets the player must answer (decision cards):
 * backdrop taps and the ✕ are both suppressed.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  dismissible = true,
  children,
}: {
  visible: boolean;
  onClose?: () => void;
  title?: string;
  dismissible?: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const canDismiss = dismissible && !!onClose;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={canDismiss ? onClose : undefined}>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={canDismiss ? onClose : undefined}
          accessibilityRole={canDismiss ? 'button' : undefined}
          accessibilityLabel={canDismiss ? 'Close' : undefined}
        />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: insets.bottom + Spacing.four },
          ]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          {canDismiss ? (
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.close}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.closeGlyph}>
                ✕
              </ThemedText>
            </Pressable>
          ) : null}
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            bounces={false}>
            {title ? <ThemedText type="sheetTitle">{title}</ThemedText> : null}
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Overlay,
  },
  sheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  close: {
    position: 'absolute',
    top: Spacing.three,
    right: Spacing.four,
    zIndex: 1,
  },
  closeGlyph: {
    fontSize: 18,
    lineHeight: 22,
  },
  body: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
});
