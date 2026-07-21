import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ColorValue, View } from 'react-native';

export type TabName = 'hq' | 'team' | 'money' | 'market';

/** Exported so anything pointing at a tab (e.g. the intro's screen tour) uses the tab bar's own icon. */
export const TAB_SYMBOLS: Record<TabName, SymbolViewProps['name']> = {
  hq: { ios: 'building.2.fill', android: 'corporate_fare', web: 'corporate_fare' },
  team: { ios: 'person.2.fill', android: 'groups', web: 'groups' },
  money: { ios: 'dollarsign.circle.fill', android: 'attach_money', web: 'attach_money' },
  market: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' },
};

/**
 * React Navigation's tab bar renders the icon slot twice (a stacked
 * active/inactive pair it crossfades between on focus change) — the tab's
 * accessible name comes from its label, not this icon, so the icon pair is
 * marked `aria-hidden` to avoid an announced "icon icon Label" double-up.
 */
export function TabBarIcon({ name, color, size }: { name: TabName; color: ColorValue; size: number }) {
  return (
    <View aria-hidden style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <SymbolView name={TAB_SYMBOLS[name]} size={size} tintColor={color} />
    </View>
  );
}
