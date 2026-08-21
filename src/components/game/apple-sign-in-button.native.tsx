import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from 'expo-apple-authentication';
import type { ViewStyle } from 'react-native';

import { Radius } from '@/constants/theme';

/**
 * Apple's official button (Guideline requires it, or a close visual match —
 * this *is* it). `cornerRadius` matches `PrimaryButton`'s `Radius.md` so it
 * sits flush among the app's other buttons. Renders nothing on Android
 * (unsupported) or where the OS reports unavailable — same defensive shape
 * as the rest of `expo-apple-authentication`'s API.
 */
export function AppleSignInButton({ onPress, style }: { onPress: () => void; style?: ViewStyle }) {
  return (
    <AppleAuthenticationButton
      buttonType={AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={Radius.md}
      style={[{ height: 48 }, style]}
      onPress={onPress}
    />
  );
}
