import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/format';
import { ROUND_CELEBRATION_AUTO_DISMISS_MS, ROUND_CELEBRATION_START_DELAY_MS } from '@/lib/round-celebration-timing';

/** What the celebration card says about the round that just closed. */
export interface RoundCelebration {
  roundLabel: string;
  investorName: string;
  amount: number;
  /** Founder equity after the raise, 0–1. */
  equityAfter: number;
  /** Series G: nothing left to raise. */
  finalRound: boolean;
}

// A tiny module-level store, so the Money tab can fire the party and the host
// in the game layout can draw it above every tab, the HUD and the tab bar.
let current: RoundCelebration | null = null;
const listeners = new Set<() => void>();
function emit() {
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Throws the party for a round that just closed. */
export function celebrateRound(celebration: RoundCelebration) {
  current = celebration;
  emit();
}

function clearCelebration() {
  current = null;
  emit();
}

/** One full confetti flight, in seconds. */
const FLIGHT_SECONDS = 2.8;
const PIECES = 70;
const GRAVITY = 1400; // px/s²

/** Deterministic 0–1 noise per piece, so a render never reshuffles the confetti. */
function noise(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

interface Piece {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  spin: number;
  wobble: number;
  width: number;
  height: number;
  color: string;
  round: boolean;
}

function makePieces(width: number, height: number, colors: string[]): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => {
    // Half from each bottom corner, firing up and inward.
    const left = i % 2 === 0;
    const angle = (60 + noise(i, 1) * 28) * (Math.PI / 180); // 60–88° off horizontal
    const speed = height * (1.05 + noise(i, 2) * 0.55);
    const round = noise(i, 3) < 0.3;
    const size = 7 + noise(i, 4) * 6;
    return {
      x0: left ? -10 : width + 10,
      y0: height * 0.92,
      vx: (left ? 1 : -1) * Math.cos(angle) * speed * 0.75,
      vy: -Math.sin(angle) * speed,
      spin: (noise(i, 5) - 0.5) * 1440,
      wobble: 10 + noise(i, 6) * 24,
      width: size,
      height: round ? size : size * 1.7,
      color: colors[i % colors.length],
      round,
    };
  });
}

function ConfettiPiece({ piece, progress }: { piece: Piece; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = progress.value * FLIGHT_SECONDS;
    const x = piece.x0 + piece.vx * t + Math.sin(t * 6 + piece.spin) * piece.wobble;
    const y = piece.y0 + piece.vy * t + 0.5 * GRAVITY * t * t;
    const fade = progress.value > 0.75 ? 1 - (progress.value - 0.75) / 0.25 : 1;
    return {
      opacity: progress.value === 0 ? 0 : fade,
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${piece.spin * t}deg` }, { rotateX: `${t * 540}deg` }],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        { width: piece.width, height: piece.height, backgroundColor: piece.color, borderRadius: piece.round ? piece.width : 2 },
        style,
      ]}
    />
  );
}

function Confetti() {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const [pieces] = useState(() =>
    makePieces(width, height, [theme.accent, theme.success, theme.warning, theme.danger, '#B78CFF', '#FFFFFF']),
  );

  useEffect(() => {
    progress.value = withTiming(1, { duration: FLIGHT_SECONDS * 1000, easing: Easing.linear });
  }, [progress]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.passThrough]}>
      {pieces.map((piece, i) => (
        <ConfettiPiece key={i} piece={piece} progress={progress} />
      ))}
    </View>
  );
}

function CelebrationCard({ celebration }: { celebration: RoundCelebration }) {
  const theme = useTheme();
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 180 });
    scale.value = withSpring(1, { damping: 11, stiffness: 180 });
  }, [opacity, scale]);

  const cardStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.card, { backgroundColor: theme.surfaceRaised, borderColor: theme.success }, cardStyle]}>
      <ThemedText style={styles.emoji}>{celebration.finalRound ? '🏆' : '🎉'}</ThemedText>
      <ThemedText type="sheetTitle" style={styles.text}>
        {celebration.roundLabel} closed!
      </ThemedText>
      <ThemedText type="default" themeColor="success" style={styles.text}>
        {formatMoney(celebration.amount)} from {celebration.investorName}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {celebration.finalRound
          ? `Fully funded. You still own ${Math.round(celebration.equityAfter * 100)}% of the company.`
          : `You own ${Math.round(celebration.equityAfter * 100)}% of the company.`}
      </ThemedText>
      <ThemedText type="footnote" themeColor="textMuted" style={[styles.text, styles.hint]}>
        Tap to continue
      </ThemedText>
    </Animated.View>
  );
}

function Celebration({ celebration, onDone }: { celebration: RoundCelebration; onDone: () => void }) {
  const reducedMotion = useReducedMotion();
  const backdrop = useSharedValue(0);

  useEffect(() => {
    backdrop.value = withTiming(1, { duration: 200 });
    const timer = setTimeout(onDone, ROUND_CELEBRATION_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [backdrop, onDone]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={onDone}
      accessibilityRole="button"
      accessibilityLabel={`${celebration.roundLabel} closed. ${formatMoney(celebration.amount)} from ${celebration.investorName}. Tap to continue.`}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <View style={[styles.center, styles.passThrough]}>
        <CelebrationCard celebration={celebration} />
      </View>
      {reducedMotion ? null : <Confetti />}
    </Pressable>
  );
}

/**
 * Draws the round-closed party above the whole game. Mounted once in the
 * game layout; fired from anywhere with {@link celebrateRound}.
 */
export function RoundCelebrationHost() {
  const pending = useSyncExternalStore(subscribe, () => current);
  const [shown, setShown] = useState<RoundCelebration | null>(null);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setShown(pending), ROUND_CELEBRATION_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  if (!shown) return null;
  return (
    <View style={styles.host}>
      <Celebration
        key={`${shown.roundLabel}-${shown.investorName}`}
        celebration={shown}
        onDone={() => {
          setShown(null);
          clearCelebration();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  passThrough: {
    pointerEvents: 'none',
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
  },
  card: {
    width: '82%',
    maxWidth: 360,
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  emoji: {
    fontSize: 56,
    lineHeight: 68,
  },
  hint: {
    marginTop: Spacing.two,
  },
  piece: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});

