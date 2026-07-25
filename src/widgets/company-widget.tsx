/**
 * The home screen widget's layout.
 *
 * ## Everything lives inside the one function on purpose
 *
 * `babel-preset-expo`'s widgets plugin replaces a `'widget'`-directive function
 * with **a string of its own source**, which the widget extension evaluates
 * against `expo-widgets`' globals alone (`@expo/ui` components, modifiers, a
 * minimal JSX runtime). Module-scope helpers, colour constants and imports do
 * not exist over there — referencing one renders a blank tile on device, and
 * nothing catches it before the build. So the layout is a single flat function
 * with its palette inlined, matching Expo's own `with-widgets` example.
 *
 * That constraint is also why every string here arrives pre-formatted from
 * `./snapshot` (which *can* reach `src/lib/format.ts`), and why the component
 * makes no decisions of its own — `runwayCritical`, `outcomeWon` and the rest
 * are settled and tested upstream. There is nothing here worth a unit test;
 * what it needs is the device pass in task 6.
 *
 * Layout is SwiftUI, not flexbox — no grid primitive, so the medium tile's four
 * cells are a `VStack` of two `HStack`s. The app is dark-only
 * (`src/constants/theme.ts`), so the palette is fixed and
 * `environment.colorScheme` is deliberately ignored.
 */

import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { WidgetSnapshot } from './snapshot';

const CompanyWidgetLayout = (props: WidgetSnapshot, environment: WidgetEnvironment) => {
  'widget';
  // Inlined from `Colors` in src/constants/theme.ts — the extension cannot
  // import it. Keep these in step with the app by hand.
  const BACKGROUND = '#0A0A0A';
  const TEXT = '#FAFAFA';
  const TEXT_SECONDARY = '#A1A1A1';
  const TEXT_MUTED = '#6B6B6B';
  const ACCENT = '#3C87F7';
  const DANGER = '#FF6B5E';
  const SUCCESS = '#4ADE80';

  const shell = [containerBackground(BACKGROUND, 'widget')];
  const labelFont = [font({ size: 11, weight: 'semibold' }), foregroundStyle(TEXT_MUTED)];
  const headerFont = [font({ size: 12, weight: 'semibold' }), foregroundStyle(TEXT_SECONDARY)];
  const valueColor = (critical: boolean) => (critical ? DANGER : TEXT);
  const weeksColor = props.weeksReady > 0 ? ACCENT : TEXT_MUTED;
  // The one line on the tile that moves on a wall clock, and so the only
  // reason the widget is worth keeping on a home screen.
  const weeksLine = props.weeksReady > 0 ? `${props.weeksReady} ready` : 'More at midnight';

  // No save yet — an invitation, no numbers.
  if (props.status === 'none') {
    return (
      <VStack alignment="leading" spacing={4} modifiers={[...shell, padding({ all: 12 })]}>
        <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(TEXT)]}>
          Startup Tycoon
        </Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(TEXT_SECONDARY)]}>
          Start your company
        </Text>
      </VStack>
    );
  }

  // The run has ended: the outcome and the founder's take-home, nothing live.
  if (props.status === 'over') {
    return (
      <VStack alignment="leading" spacing={4} modifiers={[...shell, padding({ all: 12 })]}>
        <HStack modifiers={[frame({ maxWidth: Infinity })]}>
          <Text modifiers={headerFont}>{props.companyName}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(TEXT_MUTED)]}>
            {`Week ${props.week}`}
          </Text>
        </HStack>
        <Spacer />
        <Text
          modifiers={[
            font({ size: 20, weight: 'bold' }),
            foregroundStyle(props.outcomeWon ? SUCCESS : DANGER),
          ]}>
          {props.scoreLabel ? `${props.outcomeLabel} · ${props.scoreLabel}` : props.outcomeLabel}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 12 }), foregroundStyle(TEXT_SECONDARY)]}>
          Tap to start a new run
        </Text>
      </VStack>
    );
  }

  // Small: runway as the hero (it is the loss condition, and it stays
  // meaningful while every other number is frozen), weeks-ready as the footer.
  if (environment.widgetFamily === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={2} modifiers={[...shell, padding({ all: 12 })]}>
        <HStack modifiers={[frame({ maxWidth: Infinity })]}>
          <Text modifiers={headerFont}>{props.companyName}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(TEXT_MUTED)]}>
            {`Wk ${props.week}`}
          </Text>
        </HStack>
        <Spacer />
        <Text
          modifiers={[
            font({ size: 34, weight: 'bold' }),
            foregroundStyle(valueColor(props.runwayCritical)),
          ]}>
          {props.runwayLabel}
        </Text>
        <Text modifiers={labelFont}>runway</Text>
        <Spacer />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(weeksColor)]}>
          {weeksLine}
        </Text>
      </VStack>
    );
  }

  // Medium: a 2×2 of cash / runway / valuation / weeks-ready. Each cell is a
  // VStack followed by a Spacer so the pair shares the row.
  return (
    <VStack alignment="leading" spacing={10} modifiers={[...shell, padding({ all: 12 })]}>
      <HStack modifiers={[frame({ maxWidth: Infinity })]}>
        <Text modifiers={headerFont}>{props.companyName}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(TEXT_MUTED)]}>
          {props.decisionPending ? 'Decision waiting' : `Week ${props.week}`}
        </Text>
      </HStack>
      <Spacer />
      <HStack spacing={12} modifiers={[frame({ maxWidth: Infinity })]}>
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={labelFont}>CASH</Text>
          <Text
            modifiers={[
              font({ size: 17, weight: 'bold' }),
              foregroundStyle(valueColor(props.cashNegative)),
            ]}>
            {props.cashLabel}
          </Text>
        </VStack>
        <Spacer />
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={labelFont}>RUNWAY</Text>
          <Text
            modifiers={[
              font({ size: 17, weight: 'bold' }),
              foregroundStyle(valueColor(props.runwayCritical)),
            ]}>
            {props.runwayLabel}
          </Text>
        </VStack>
        <Spacer />
      </HStack>
      <HStack spacing={12} modifiers={[frame({ maxWidth: Infinity })]}>
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={labelFont}>VALUATION</Text>
          <Text modifiers={[font({ size: 17, weight: 'bold' }), foregroundStyle(TEXT)]}>
            {props.valuationLabel}
          </Text>
        </VStack>
        <Spacer />
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={labelFont}>WEEKS READY</Text>
          <Text modifiers={[font({ size: 17, weight: 'bold' }), foregroundStyle(weeksColor)]}>
            {String(props.weeksReady)}
          </Text>
        </VStack>
        <Spacer />
      </HStack>
      <Spacer />
    </VStack>
  );
};

/** The name must match the `widgets[].name` entry in `app.json`. */
export const CompanyWidget = createWidget<WidgetSnapshot>('CompanyWidget', CompanyWidgetLayout);

export default CompanyWidget;
