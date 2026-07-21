import { Button, Column, Host, ScrollView as UiScrollView, Text as UiText, TextInput, type TextInputProps } from '@expo/ui';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EVENTS, track } from '@/analytics/events';
import { PrimaryButton } from '@/components/game/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { DEFAULT_COMPANY_NAME } from '@/game/engine';
import type { FocusId } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { useGame } from '@/state/game-store';

const NAME_MAX_LENGTH = 40;

/** App accent, mirrored from PrimaryButton. Tints the native Button via the Host seed. */
const ACCENT = '#3c87f7';

/**
 * The intro story, in order (plan §4, Phase A). Brand-new players walk the
 * whole arc; anyone who has already seen it starts at `name` — they've
 * committed once, but still name each new company and pick a founder type
 * per run.
 */
const STEPS = ['hook', 'name', 'founder', 'reflect'] as const;
type Step = (typeof STEPS)[number];

/** The founder-type question (A3). Each answer *is* the run's starting Focus. */
const FOUNDER_TYPES: { focus: FocusId; label: string; blurb: string }[] = [
  { focus: 'core', label: 'Product perfectionist', blurb: 'Ship quality, win on craft' },
  { focus: 'ai', label: 'AI true believer', blurb: 'Ride the smartest wave in tech' },
  { focus: 'hardware', label: 'Hardware builder', blurb: 'Real things you can hold' },
  { focus: 'hype', label: 'Hype machine', blurb: 'Attention first, product later' },
];

/** A4's mirror-it-back line, one per founder type. `{company}` is substituted. */
const REFLECTION: Record<FocusId, string> = {
  core: "You're a product-first founder — {company} will win on quality. Devs build it, customers pay for it, rivals copy it.",
  ai: "You're betting on AI — {company} rides the wave while it's rising, and lives with the crash when it isn't.",
  hardware: "You're building real things — {company} charges more per customer, and burns more to get there.",
  hype: "You're selling the story first — {company} grows on attention, as long as the product catches up.",
};

export default function OnboardingScreen() {
  const { profile, setCeoName, startNewGame, markOnboardingSeen } = useGame();
  const router = useRouter();

  const isReturningCeo = !!profile?.ceoName;
  // Legacy profiles (saved before the intro was versioned) have no stamp, so
  // they're treated the same as "hasn't seen it" and get the full story once.
  const showIntro = !profile?.onboardingVersion;

  const [step, setStep] = useState<Step>(showIntro ? 'hook' : 'name');
  const [ceoName, setCeoNameInput] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [focus, setFocus] = useState<FocusId>('core');

  const trimmedCeoName = ceoName.trim();
  const trimmedCompanyName = companyName.trim();
  const company = trimmedCompanyName || DEFAULT_COMPANY_NAME;

  useEffect(() => {
    track(EVENTS.ONBOARDING_VIEWED, { is_returning_ceo: isReturningCeo });
    if (showIntro) track(EVENTS.ONBOARDING_INTRO_STARTED);
    // Fires once per mount; `showIntro`/`isReturningCeo` can't change mid-screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    track(EVENTS.ONBOARDING_STEP_VIEWED, { step });
  }, [step]);

  const confirmNames = () => {
    if (!isReturningCeo) setCeoName(trimmedCeoName);
    setStep('founder');
  };

  const chooseFounderType = (chosen: FocusId) => {
    setFocus(chosen);
    track(EVENTS.ONBOARDING_FOUNDER_TYPE, { focus: chosen });
    setStep('reflect');
  };

  const enterHq = () => {
    track(EVENTS.ONBOARDING_COMPLETED, { is_returning_ceo: isReturningCeo, focus });
    markOnboardingSeen();
    startNewGame(company, focus);
    router.replace('/hq');
  };

  if (step === 'name') {
    return (
      <NameStep
        isReturningCeo={isReturningCeo}
        ceoName={profile?.ceoName}
        canConfirm={
          isReturningCeo ? trimmedCompanyName.length > 0 : trimmedCeoName.length > 0 && trimmedCompanyName.length > 0
        }
        confirmLabel={trimmedCompanyName ? `Found ${trimmedCompanyName}` : 'Found the company'}
        onChangeCeoName={setCeoNameInput}
        onChangeCompanyName={setCompanyName}
        onConfirm={confirmNames}
      />
    );
  }

  if (step === 'hook') {
    return (
      <StoryStep
        stepKey="hook"
        headline="You just quit your job."
        body="You've got an idea, a little cash, and rent due in a few months. Time to build something people want — before the money runs out."
        primaryLabel="Let's do this"
        onPrimary={() => setStep('name')}
        onSkip={() => {
          track(EVENTS.ONBOARDING_SKIPPED, { at_step: 'hook' });
          setStep('name');
        }}
      />
    );
  }

  if (step === 'founder') {
    return (
      <StoryStep stepKey="founder" headline="What kind of founder are you?" body="One tap. It sets how your company starts.">
        <View style={styles.options}>
          {FOUNDER_TYPES.map((option) => (
            <Pressable
              key={option.focus}
              onPress={() => chooseFounderType(option.focus)}
              accessibilityRole="button"
              accessibilityLabel={`${option.label} — ${option.blurb}`}>
              <ThemedView type="backgroundElement" style={styles.optionCard}>
                <ThemedText type="default" style={styles.optionLabel}>
                  {option.label}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {option.blurb}
                </ThemedText>
              </ThemedView>
            </Pressable>
          ))}
        </View>
      </StoryStep>
    );
  }

  return (
    <StoryStep
      stepKey="reflect"
      headline={`${company} is live.`}
      body={REFLECTION[focus].replace(/\{company\}/g, company)}
      primaryLabel="Take me to HQ"
      onPrimary={enterHq}>
      <ThemedView type="backgroundElement" style={styles.promiseCard}>
        <ThemedText type="small" style={styles.promiseText}>
          Your job from here is simple: make the calls, one week at a time. Everything on the next screen is just
          information to help you decide. When you&apos;re ready — hit &quot;Next Week&quot;.
        </ThemedText>
      </ThemedView>
    </StoryStep>
  );
}

/**
 * One full-screen story beat (A1 / A3 / A4): headline, body, optional content,
 * and an optional primary action pinned under the copy. Crossfades in, so
 * stepping through the arc reads as one moving screen rather than four.
 */
function StoryStep({
  stepKey,
  headline,
  body,
  primaryLabel,
  onPrimary,
  onSkip,
  children,
}: {
  stepKey: Step;
  headline: string;
  body: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  onSkip?: () => void;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <Animated.View key={stepKey} entering={FadeIn.duration(260)} style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.five }]}>
          <ThemedText type="subtitle">{headline}</ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.body}>
            {body}
          </ThemedText>

          {children}

          {primaryLabel && onPrimary ? <PrimaryButton label={primaryLabel} onPress={onPrimary} /> : null}

          {onSkip ? (
            <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button" style={styles.skip}>
              <ThemedText type="small" themeColor="textSecondary">
                Skip intro
              </ThemedText>
            </Pressable>
          ) : null}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/**
 * A2 — name capture. Kept on `@expo/ui` (a SwiftUI ScrollView on iOS /
 * Compose on Android, both of which lift their content above the keyboard
 * automatically), so it stays a separate root rather than a `StoryStep` child.
 */
function NameStep({
  isReturningCeo,
  ceoName,
  canConfirm,
  confirmLabel,
  onChangeCeoName,
  onChangeCompanyName,
  onConfirm,
}: {
  isReturningCeo: boolean;
  ceoName: string | undefined;
  canConfirm: boolean;
  confirmLabel: string;
  onChangeCeoName: (text: string) => void;
  onChangeCompanyName: (text: string) => void;
  onConfirm: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const confirm = () => {
    if (canConfirm) onConfirm();
  };

  return (
    <Host style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]} seedColor={ACCENT}>
      <UiScrollView
        style={{
          paddingHorizontal: Spacing.four,
          paddingTop: Spacing.six,
          paddingBottom: Spacing.five,
        }}>
        <Column spacing={Spacing.four}>
          <Column spacing={Spacing.two}>
            <UiText textStyle={{ fontSize: 34, fontWeight: '700', lineHeight: 40, color: theme.text }}>
              {isReturningCeo ? `Welcome back, ${ceoName}.` : 'Every startup starts with a name.'}
            </UiText>
            <UiText textStyle={{ fontSize: 18, lineHeight: 26, color: theme.textSecondary }}>
              {isReturningCeo ? "What's the next company?" : "What should we call you, founder? And what's the company?"}
            </UiText>
          </Column>

          {!isReturningCeo ? (
            <Field label="Your name" placeholder="CEO name" onChangeText={onChangeCeoName} autoFocus returnKeyType="next" />
          ) : null}

          <Field
            label="Company name"
            placeholder="Company name"
            onChangeText={onChangeCompanyName}
            autoFocus={isReturningCeo}
            returnKeyType="done"
            onSubmitEditing={confirm}
          />

          <Button label={confirmLabel} onPress={confirm} disabled={!canConfirm} />
        </Column>
      </UiScrollView>
    </Host>
  );
}

/** A labeled text field. Shares the input chrome (padding, capitalization, length cap) across the CEO and company inputs. */
function Field({ label, ...input }: { label: string } & TextInputProps) {
  const theme = useTheme();
  return (
    <Column spacing={Spacing.two}>
      <UiText textStyle={{ fontSize: 13, color: theme.textSecondary }}>{label}</UiText>
      <TextInput
        maxLength={NAME_MAX_LENGTH}
        autoCapitalize="words"
        placeholderTextColor={theme.textSecondary}
        style={{
          backgroundColor: theme.backgroundElement,
          borderRadius: Spacing.three,
          paddingHorizontal: Spacing.three,
          paddingVertical: Spacing.three,
        }}
        textStyle={{ fontSize: 17, color: theme.text }}
        {...input}
      />
    </Column>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    gap: Spacing.four,
  },
  body: {
    lineHeight: 26,
  },
  options: {
    gap: Spacing.three,
  },
  optionCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  optionLabel: {
    fontWeight: '700',
  },
  promiseCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  promiseText: {
    lineHeight: 22,
  },
  skip: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
});
