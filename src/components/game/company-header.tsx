import { StyleSheet, View } from 'react-native';

import { CompanyLogoTile } from '@/components/game/company-logo-tile';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { FocusId, Stage } from '@/game/types';
import { FOCUS_LABEL, STAGE_LABEL } from '@/lib/strategy-copy';

/** Identity block at the top of HQ: logo tile, company name, stage · focus. */
export function CompanyHeader({
  name,
  stage,
  focus,
  logo,
  onPressLogo,
}: {
  name: string;
  stage: Stage;
  focus: FocusId;
  logo?: string;
  onPressLogo?: () => void;
}) {
  return (
    <View style={styles.row}>
      <CompanyLogoTile name={name} logo={logo} onPress={onPressLogo} />
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
  text: {
    flex: 1,
  },
});
