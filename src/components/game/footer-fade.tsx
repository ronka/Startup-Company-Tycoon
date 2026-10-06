import { StyleSheet, View } from 'react-native';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/** Lets scrolling cards recede into the fixed footer without a hard clipping edge. */
export function FooterFade() {
  const theme = useTheme();
  return (
    <View pointerEvents="none" style={styles.fade}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="footerFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.background} stopOpacity={0} />
            <Stop offset="0.45" stopColor={theme.background} stopOpacity={0.4} />
            <Stop offset="1" stopColor={theme.background} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#footerFade)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', top: -40, left: 0, right: 0, height: 40 },
});
