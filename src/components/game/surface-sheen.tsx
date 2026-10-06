import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

/** A light catching the upper edge of the game's dark surfaces. */
export function SurfaceSheen() {
  const id = `sheen${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0%" y1="0%" x2="80%" y2="100%">
            <Stop offset="0" stopColor="#B8D3FF" stopOpacity={0.1} />
            <Stop offset="0.5" stopColor="#B8D3FF" stopOpacity={0.025} />
            <Stop offset="1" stopColor="#B8D3FF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100" height="100" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
