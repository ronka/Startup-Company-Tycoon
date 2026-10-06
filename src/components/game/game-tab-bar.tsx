import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { Pressable, StyleSheet, View } from 'react-native';

import { GameArt, GAME_ART } from '@/components/game/game-art';
import { SurfaceSheen } from '@/components/game/surface-sheen';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function GameTabBar({ state, descriptors, navigation, bottomInset, moneyHasAction }: BottomTabBarProps & {
  bottomInset: number;
  moneyHasAction: boolean;
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
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title ?? route.name}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={({ pressed }) => [styles.tab, focused && { backgroundColor: theme.accentSurface }, pressed && { opacity: 0.7 }]}>
              <GameArt name={route.name as keyof typeof GAME_ART} size={48} />
              <ThemedText type="smallBold" themeColor={focused ? 'text' : 'textSecondary'}>
                {options.title}
              </ThemedText>
              {focused ? <View style={[styles.indicator, { backgroundColor: theme.accent }]} /> : null}
              {route.name === 'money' && moneyHasAction ? <View style={[styles.badge, { backgroundColor: theme.accent }]} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderWidth: 1, borderRadius: 30, overflow: 'hidden' },
  tab: { flex: 1, alignItems: 'center', paddingTop: 2, paddingBottom: 10, borderRadius: 28 },
  indicator: { position: 'absolute', bottom: 4, height: 3, width: 28, borderRadius: 2 },
  badge: { position: 'absolute', top: 10, right: 15, width: 8, height: 8, borderRadius: 4 },
});
