import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { Pressable, StyleSheet, View } from 'react-native';

import { GameArt, GAME_ART } from '@/components/game/game-art';
import { Glow } from '@/components/game/glow';
import { SurfaceSheen } from '@/components/game/surface-sheen';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const EMPTY: ReadonlySet<string> = new Set();

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function GameTabBar({
  state,
  descriptors,
  navigation,
  bottomInset,
  moneyHasAction,
  lockedRoutes = EMPTY,
  glowRoute = null,
}: BottomTabBarProps & {
  bottomInset: number;
  moneyHasAction: boolean;
  /** Tabs a guided run hasn't unlocked: dimmed with a lock. Still tappable — the screen explains when it opens. */
  lockedRoutes?: ReadonlySet<string>;
  /** The tab holding the control the quest or recommended action needs. */
  glowRoute?: string | null;
}) {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: Math.max(bottomInset, 8), paddingTop: 4 }}>
      <View style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <SurfaceSheen />
        {state.routes.map((route, index) => {
          if (!(route.name in GAME_ART)) return null;
          const focused = state.index === index;
          const options = descriptors[route.key].options;
          const locked = lockedRoutes.has(route.name);
          return (
            <Glow key={route.key} on={glowRoute === route.name} inset radius={28} style={styles.tabSlot}>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={`${options.tabBarAccessibilityLabel ?? options.title ?? route.name}${locked ? ', locked' : ''}`}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
                }}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                style={({ pressed }) => [styles.tab, focused && { backgroundColor: theme.accentSurface }, pressed && { opacity: 0.7 }]}>
                <View style={locked ? styles.lockedArt : undefined}>
                  <GameArt name={route.name as keyof typeof GAME_ART} size={48} />
                </View>
                <ThemedText type="smallBold" themeColor={locked ? 'textMuted' : focused ? 'text' : 'textSecondary'}>
                  {locked ? '🔒 ' : ''}
                  {options.title}
                </ThemedText>
                {focused ? <View style={[styles.indicator, { backgroundColor: theme.accent }]} /> : null}
                {route.name === 'money' && moneyHasAction ? <View style={[styles.badge, { backgroundColor: theme.accent }]} /> : null}
              </Pressable>
            </Glow>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderWidth: 1, borderRadius: 30, overflow: 'hidden' },
  tabSlot: { flex: 1 },
  // The Glow slot carries the row's flex: a `flex: 1` here, inside that column wrapper, collapses the tab to zero height on native.
  tab: { alignItems: 'center', paddingTop: 2, paddingBottom: 10, borderRadius: 28 },
  lockedArt: { opacity: 0.35 },
  indicator: { position: 'absolute', bottom: 4, height: 3, width: 28, borderRadius: 2 },
  badge: { position: 'absolute', top: 10, right: 15, width: 8, height: 8, borderRadius: 4 },
});
