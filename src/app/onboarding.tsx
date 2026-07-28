import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EVENTS, track } from '@/analytics/events';
import { Card } from '@/components/game/card';
import { CompanyLogoTile } from '@/components/game/company-logo-tile';
import { LogoPickerSheet } from '@/components/game/logo-picker-sheet';
import { PrimaryButton } from '@/components/game/primary-button';
import { SectionHeader } from '@/components/game/section-header';
import { ThemedText } from '@/components/themed-text';
import { TAB_SYMBOLS, type TabName } from '@/components/ui/tab-bar-icon';
import { Radius, Spacing } from '@/constants/theme';
import { BANKRUPTCY_FUSE_WEEKS } from '@/game/balance';
import { randomCompanyLogo } from '@/game/company-logo';
import { DEFAULT_COMPANY_NAME, newGame } from '@/game/engine';
import type { FocusId } from '@/game/types';
import { useTheme } from '@/hooks/use-theme';
import { deriveWeeklyStats } from '@/lib/derived-stats';
import { formatMoney, formatWeeks } from '@/lib/format';
import { FOCUS_LABEL } from '@/lib/strategy-copy';
import { ONBOARDING_VERSION, useGame } from '@/state/game-store';

const NAME_MAX_LENGTH = 40;

/** Fixed seed for the week-1 preview state; see `previewState` for why it doesn't have to match the run's. */
const PREVIEW_SEED = 1;

/**
 * The beats of the intro story (plan §4, Phase A). The union is just the set of
 * beats — each beat below owns its own `setStep` transition, so the arc lives in
 * the render body, not here.
 *
 * Brand-new players walk the whole arc: hook → name → founder → reflect → goal →
 * launch. Anyone who has already seen it starts at `name` and exits after
 * `reflect` — they've committed once and know the rules, but still name each
 * new company and pick a founder type per run.
 *
 * `goal` and `launch` close the arc for first-timers: what winning and losing
 * actually mean, then their own week-1 numbers. Deliberately *not* a feature
 * tour — every stat and control is taught in place by `FirstRunHint` and the
 * glossary (PRD F11), so these two beats only carry what those hints can't:
 * the objective, the fail condition, and where the four screens live.
 */
type Step = 'hook' | 'name' | 'founder' | 'reflect' | 'goal' | 'launch';

/**
 * The founder-type question (A3). Each answer *is* the run's starting Focus.
 * Icons follow the `{ ios, android, web }` shape the rest of the app uses for
 * SF Symbols with Material fallbacks (see `StatTile`, `TabBarIcon`).
 */
const FOUNDER_TYPES: { focus: FocusId; label: string; blurb: string; icon: SymbolViewProps['name'] }[] = [
  {
    focus: 'core',
    label: 'Product perfectionist',
    blurb: 'Ship quality, win on craft',
    icon: { ios: 'hammer.fill', android: 'build', web: 'build' },
  },
  {
    focus: 'ai',
    label: 'AI true believer',
    blurb: 'Ride the smartest wave in tech',
    icon: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  },
  {
    focus: 'hardware',
    label: 'Hardware builder',
    blurb: 'Real things you can hold',
    icon: { ios: 'cpu.fill', android: 'memory', web: 'memory' },
  },
  {
    focus: 'hype',
    label: 'Hype machine',
    blurb: 'Attention first, product later',
    icon: { ios: 'megaphone.fill', android: 'campaign', web: 'campaign' },
  },
];

/** The four tabs, in bar order, for the `launch` beat's screen tour. */
const TAB_TOUR: { tab: TabName; label: string; blurb: string }[] = [
  { tab: 'hq', label: 'HQ', blurb: 'Steer the company, week by week' },
  { tab: 'team', label: 'Team', blurb: 'Hire the people who build it' },
  { tab: 'money', label: 'Money', blurb: 'Raise cash before it runs out' },
  { tab: 'market', label: 'Market', blurb: 'Watch what your rivals are up to' },
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
  // Comparing against the current revision — rather than just checking for a
  // stamp — is what makes bumping `ONBOARDING_VERSION` replay the story for
  // players who only ever saw an older cut of it.
  const showIntro = (profile?.onboardingVersion ?? 0) < ONBOARDING_VERSION;

  const [step, setStep] = useState<Step>(showIntro ? 'hook' : 'name');
  const [ceoName, setCeoNameInput] = useState('');
  const [companyName, setCompanyName] = useState('');
  // Seeded with a random emoji so the founding tile is never blank; the player
  // can swap it, or clear it back to initials, from the tile itself.
  const [logo, setLogo] = useState<string | undefined>(() => randomCompanyLogo());
  const [focus, setFocus] = useState<FocusId>('core');

  const trimmedCeoName = ceoName.trim();
  const trimmedCompanyName = companyName.trim();
  const company = trimmedCompanyName || DEFAULT_COMPANY_NAME;

  // The `launch` beat previews the run's real week-1 numbers. It builds a
  // throwaway state to read them off rather than duplicating the formulas —
  // the seed is irrelevant because cash, burn and runway at week 0 are fixed by
  // the starting constants and the chosen focus, not by the RNG (headcount is
  // empty and no C-level is hired yet), so the preview matches the run the
  // player is about to start even though that run draws its own seed.
  const previewState = useMemo(() => newGame(company, PREVIEW_SEED, focus), [company, focus]);
  const preview = deriveWeeklyStats(previewState);

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
    startNewGame(company, focus, undefined, logo);
    router.replace('/hq');
  };

  if (step === 'name') {
    return (
      <NameStep
        isReturningCeo={isReturningCeo}
        ceoName={profile?.ceoName}
        companyName={company}
        logo={logo}
        onChangeLogo={(next) => setLogo(next ?? undefined)}
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
        eyebrow="Startup Tycoon"
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
      <StoryStep
        stepKey="founder"
        eyebrow="Pick your bet"
        headline="What kind of founder are you?"
        body="There's no safe answer. Pick the bet you'd actually make — it sets how your company starts.">
        <View style={styles.options}>
          {FOUNDER_TYPES.map((option) => (
            <Pressable
              key={option.focus}
              onPress={() => chooseFounderType(option.focus)}
              accessibilityRole="button"
              accessibilityLabel={`${option.label} — ${option.blurb}`}
              style={({ pressed }) => pressed && styles.pressed}>
              <IconCard icon={option.icon} label={option.label} text={option.blurb} chevron />
            </Pressable>
          ))}
        </View>
      </StoryStep>
    );
  }

  if (step === 'reflect') {
    const founder = FOUNDER_TYPES.find((option) => option.focus === focus) ?? FOUNDER_TYPES[0];
    return (
      <StoryStep
        stepKey="reflect"
        eyebrow="Day one"
        headline={`${company} is live.`}
        body={REFLECTION[focus].replace(/\{company\}/g, company)}
        // First-timers still owe the rules; a returning CEO already knows them
        // and goes straight to their desk.
        primaryLabel={showIntro ? 'So how do I win?' : 'Take me to HQ'}
        onPrimary={showIntro ? () => setStep('goal') : enterHq}>
        <IconCard
          tone="accent"
          icon={founder.icon}
          label={founder.label}
          text={`Starting focus: ${FOCUS_LABEL[focus]} — you can switch later from HQ, for a price.`}
        />
      </StoryStep>
    );
  }

  if (step === 'goal') {
    return (
      <StoryStep
        stepKey="goal"
        eyebrow="The rules"
        headline="How this ends."
        body="Every startup ends. Yours ends one of three ways — and only two of them pay."
        primaryLabel="Got it"
        onPrimary={() => setStep('launch')}>
        <View style={styles.options}>
          <IconCard
            icon={{ ios: 'flag.checkered', android: 'flag', web: 'flag' }}
            label="You exit"
            text="Go public, or sell the company. That's the win, and it's the only way you get paid."
          />
          <IconCard
            icon={{ ios: 'chart.pie.fill', android: 'pie_chart', web: 'pie_chart' }}
            label="Your score is what you walk away with"
            text="The slice of the company you still own × what it's worth when you exit. Every round you raise buys time and costs you a piece of that slice."
          />
          <IconCard
            tone="alert"
            icon={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
            label="Or you run out of money"
            text={`${BANKRUPTCY_FUSE_WEEKS} straight weeks in the red and it's over. Bankruptcy pays nothing.`}
          />
        </View>
      </StoryStep>
    );
  }

  return (
    <StoryStep
      stepKey="launch"
      eyebrow="Starting position"
      headline={`Week 1 at ${company}.`}
      body="An empty office, a bank balance, and a clock. Here's where you're starting:"
      primaryLabel="Take me to HQ"
      onPrimary={enterHq}>
      <Card style={styles.statRow}>
        <PreviewStat
          label="Cash"
          value={formatMoney(previewState.cash)}
          icon={{ ios: 'banknote.fill', android: 'payments', web: 'payments' }}
        />
        <PreviewStat
          label="Burn / wk"
          value={formatMoney(preview.burn)}
          icon={{ ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' }}
        />
        <PreviewStat
          label="Runway"
          value={formatWeeks(preview.runway)}
          icon={{ ios: 'clock.fill', android: 'schedule', web: 'schedule' }}
        />
      </Card>

      <View style={styles.tourSection}>
        <SectionHeader label="Your four screens" />
        <View style={styles.options}>
          {TAB_TOUR.map((entry) => (
            <IconCard key={entry.tab} icon={TAB_SYMBOLS[entry.tab]} label={entry.label} text={entry.blurb} />
          ))}
        </View>
      </View>

      <Card>
        <ThemedText type="small" themeColor="textSecondary" style={styles.promiseText}>
          Make the calls, one week at a time — then hit &quot;Next Week&quot; and find out.
        </ThemedText>
      </Card>
    </StoryStep>
  );
}

/**
 * The intro's workhorse row: a tinted icon badge beside a bold claim and its
 * one-line consequence. Used for the founder options, the rules of the run, and
 * the screen tour, so all three read as the same family of cards.
 */
function IconCard({
  icon,
  label,
  text,
  tone = 'default',
  chevron = false,
}: {
  icon: SymbolViewProps['name'];
  label: string;
  text: string;
  tone?: 'default' | 'accent' | 'alert';
  chevron?: boolean;
}) {
  const theme = useTheme();
  const ink = tone === 'alert' ? theme.danger : tone === 'accent' ? theme.accent : theme.text;

  return (
    <Card tone={tone} style={styles.iconCard}>
      <View
        style={[
          styles.iconBadge,
          {
            backgroundColor: tone === 'default' ? theme.surfaceRaised : 'transparent',
            borderColor: tone === 'default' ? theme.border : ink,
          },
        ]}>
        <SymbolView name={icon} size={20} tintColor={ink} />
      </View>
      <View style={styles.iconCardText}>
        <ThemedText type="smallBold" style={[styles.iconCardLabel, { color: ink }]}>
          {label}
        </ThemedText>
        <ThemedText
          type="small"
          themeColor={tone === 'alert' ? 'danger' : 'textSecondary'}
          style={styles.promiseText}>
          {text}
        </ThemedText>
      </View>
      {chevron ? (
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={14}
          tintColor={theme.textMuted}
        />
      ) : null}
    </Card>
  );
}

/** One of the three week-1 numbers on the `launch` beat. */
function PreviewStat({ label, value, icon }: { label: string; value: string; icon: SymbolViewProps['name'] }) {
  const theme = useTheme();
  return (
    <View style={styles.previewStat}>
      <View style={styles.previewStatLabel}>
        <SymbolView name={icon} size={14} tintColor={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      </View>
      <ThemedText type="cardValue">{value}</ThemedText>
    </View>
  );
}

/**
 * One full-screen story beat (A1 / A3 / A4): headline, body, optional content,
 * and an optional primary action pinned under the copy. Crossfades in, so
 * stepping through the arc reads as one moving screen rather than four.
 */
function StoryStep({
  stepKey,
  eyebrow,
  headline,
  body,
  primaryLabel,
  onPrimary,
  onSkip,
  children,
}: {
  stepKey: Step;
  /** Uppercase label above the headline — the same divider treatment the game screens use. */
  eyebrow?: string;
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
          <View style={styles.header}>
            {eyebrow ? <ThemedText type="sectionLabel">{eyebrow}</ThemedText> : null}
            <ThemedText type="subtitle">{headline}</ThemedText>
          </View>
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
 * A2 — name capture. The keyboard covers most of a small phone, so the form
 * lives in a `KeyboardAvoidingView` + `ScrollView`: the headline scrolls away
 * and the confirm button stays reachable above the keys. (The native `@expo/ui`
 * ScrollView this used to sit on only kept the *focused field* visible, which
 * left the button underneath the keyboard.)
 */
function NameStep({
  isReturningCeo,
  ceoName,
  companyName,
  logo,
  canConfirm,
  confirmLabel,
  onChangeCeoName,
  onChangeCompanyName,
  onChangeLogo,
  onConfirm,
}: {
  isReturningCeo: boolean;
  ceoName: string | undefined;
  /** Already falls back to `DEFAULT_COMPANY_NAME`, so the logo tile always has initials to show. */
  companyName: string;
  logo: string | undefined;
  canConfirm: boolean;
  confirmLabel: string;
  onChangeCeoName: (text: string) => void;
  onChangeCompanyName: (text: string) => void;
  onChangeLogo: (logo: string | null) => void;
  onConfirm: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);

  const confirm = () => {
    if (canConfirm) onConfirm();
  };

  const openLogoPicker = () => {
    track(EVENTS.COMPANY_LOGO_PICKER_OPENED, { surface: 'founding', had_logo: logo != null });
    // The name field is autofocused inside a KeyboardAvoidingView — handing the
    // keyboard straight to the sheet's own input races the modal transition.
    Keyboard.dismiss();
    setLogoPickerOpen(true);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.nameContent, { paddingBottom: insets.bottom + Spacing.five }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}>
        <View style={styles.nameHeader}>
          <ThemedText type="sectionLabel">{isReturningCeo ? 'New run' : 'Founding'}</ThemedText>
          <ThemedText type="subtitle">
            {isReturningCeo ? `Welcome back, ${ceoName}.` : 'Every startup starts with a name.'}
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.body}>
            {isReturningCeo ? "What's the next company?" : "What should we call you, founder? And what's the company?"}
          </ThemedText>
        </View>

        {!isReturningCeo ? (
          <Field label="Your name" placeholder="CEO name" onChangeText={onChangeCeoName} autoFocus returnKeyType="next" />
        ) : null}

        <View style={styles.companyRow}>
          <CompanyLogoTile name={companyName} logo={logo} onPress={openLogoPicker} />
          <View style={styles.companyField}>
            <Field
              label="Company name"
              placeholder="Company name"
              onChangeText={onChangeCompanyName}
              autoFocus={isReturningCeo}
              returnKeyType="done"
              onSubmitEditing={confirm}
            />
          </View>
        </View>

        <PrimaryButton label={confirmLabel} onPress={confirm} disabled={!canConfirm} />
      </ScrollView>

      <LogoPickerSheet
        visible={logoPickerOpen}
        name={companyName}
        logo={logo}
        onCommit={onChangeLogo}
        onClose={() => setLogoPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

/** A labeled text field. Shares the input chrome (padding, capitalization, length cap) across the CEO and company inputs. */
function Field({ label, style, ...input }: { label: string } & TextInputProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="sectionLabel">{label}</ThemedText>
      <TextInput
        maxLength={NAME_MAX_LENGTH}
        autoCapitalize="words"
        placeholderTextColor={theme.textMuted}
        style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }, style]}
        {...input}
      />
    </View>
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
  header: {
    gap: Spacing.one,
  },
  body: {
    lineHeight: 26,
  },
  nameContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    gap: Spacing.four,
  },
  nameHeader: {
    gap: Spacing.two,
  },
  field: {
    gap: Spacing.two,
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  companyField: {
    flex: 1,
  },
  input: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 17,
  },
  options: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.85,
  },
  iconCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCardText: {
    flex: 1,
    gap: Spacing.half,
  },
  iconCardLabel: {
    fontSize: 16,
    lineHeight: 22,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  previewStat: {
    flex: 1,
    gap: Spacing.half,
  },
  previewStatLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  tourSection: {
    gap: Spacing.two,
  },
  promiseText: {
    lineHeight: 22,
  },
  skip: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
});
