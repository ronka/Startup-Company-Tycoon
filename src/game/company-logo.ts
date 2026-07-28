/**
 * The company logo: one emoji the player picks at founding and can change from
 * the HQ header. Purely cosmetic — nothing in the simulation reads it.
 *
 * Entry is the system emoji keyboard, which can also type letters, spaces and
 * multi-codepoint sequences, so `sanitizeCompanyLogo` is what keeps the 48px
 * tile renderable: it takes the last emoji cluster and rejects anything else.
 *
 * The emoji test is a hand-rolled code-point range table rather than
 * `Intl.Segmenter` or a `\p{Extended_Pictographic}` regex. Both work in Node
 * (where the tests run) but aren't guaranteed in Hermes, so a green test would
 * prove nothing about the device.
 */

/** Seeds the founding tile so it's never blank. Not a constrained palette — the player can type any emoji. */
export const COMPANY_LOGO_SUGGESTIONS: readonly string[] = [
  '🚀',
  '💡',
  '⚡',
  '🔥',
  '🦄',
  '🌱',
  '🧠',
  '🤖',
  '📱',
  '💻',
  '🛰️',
  '🔬',
  '📈',
  '🏆',
  '🎯',
  '🐙',
  '🐝',
  '🌊',
  '🪐',
  '☕',
];

/**
 * Pick a suggestion, never `current` — so the picker's "Random" button always
 * visibly changes something. `random` is injectable for deterministic tests.
 */
export function randomCompanyLogo(current?: string, random: () => number = Math.random): string {
  const options = COMPANY_LOGO_SUGGESTIONS.filter((emoji) => emoji !== current);
  return options[Math.floor(random() * options.length)];
}

/**
 * Longest accepted cluster. A family ZWJ sequence is 7 code points and a
 * profession-with-skin-tone is 5, so 12 leaves headroom while rejecting the
 * pathological chains a paste can produce.
 */
export const MAX_LOGO_CODE_POINTS = 12;

/** Code points that read as an emoji on their own. Deliberately broad — it also lets a few text glyphs (★, ✦) through. */
const EMOJI_RANGES: readonly (readonly [number, number])[] = [
  [0x2190, 0x21ff], // arrows
  [0x2300, 0x23ff], // misc technical — ⌚ ⏰ ⏳
  [0x2460, 0x24ff], // enclosed alphanumerics
  [0x25a0, 0x27bf], // geometric shapes → dingbats — ★ ✅ ✨ ➡
  [0x2b00, 0x2bff], // ⬛ ⭐ ⬆
  [0x3030, 0x303d],
  [0x3297, 0x3299],
  [0x1f000, 0x1faff], // the main pictograph planes, including regional-indicator flags
];

const ZWJ = 0x200d;
const KEYCAP = 0x20e3;
const VARIATION_SELECTOR_TEXT = 0xfe0e;
const VARIATION_SELECTOR_EMOJI = 0xfe0f;
const SKIN_TONE_MIN = 0x1f3fb;
const SKIN_TONE_MAX = 0x1f3ff;
const REGIONAL_MIN = 0x1f1e6;
const REGIONAL_MAX = 0x1f1ff;

const isEmojiBase = (cp: number): boolean => EMOJI_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
const isRegional = (cp: number): boolean => cp >= REGIONAL_MIN && cp <= REGIONAL_MAX;

/** Code points that attach to the base rather than starting a new emoji. */
const isCombiner = (cp: number): boolean =>
  cp === VARIATION_SELECTOR_EMOJI ||
  cp === VARIATION_SELECTOR_TEXT ||
  cp === KEYCAP ||
  (cp >= SKIN_TONE_MIN && cp <= SKIN_TONE_MAX);

/**
 * Normalize free-typed text into a single emoji, or `null` for "no logo" — the
 * caller then falls back to the company's initials.
 *
 * Returns the **last** cluster so typing a second emoji replaces the first, and
 * rejects (rather than strips) anything containing a non-emoji code point, so a
 * typed word never becomes a logo. Keycaps like `1️⃣` are rejected too: their
 * base is an ASCII digit.
 */
export function sanitizeCompanyLogo(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const points = Array.from(trimmed, (char) => char.codePointAt(0) ?? 0);
  // A ZWJ typed with nothing after it joins nothing — drop it before scanning so
  // it can't start a cluster of its own.
  while (points.length > 0 && points[points.length - 1] === ZWJ) points.pop();
  if (points.length === 0) return null;

  // Forward scan into clusters: a base code point plus everything that binds to
  // it — combiners, ZWJ-plus-the-point-it-joins, and a second regional indicator.
  let clusterStart = 0;
  let i = 0;
  while (i < points.length) {
    clusterStart = i;
    const base = points[i];
    i += 1;
    if (isRegional(base) && i < points.length && isRegional(points[i])) i += 1;
    while (i < points.length) {
      const cp = points[i];
      if (isCombiner(cp)) {
        i += 1;
      } else if (cp === ZWJ && i + 1 < points.length) {
        i += 2;
      } else {
        break;
      }
    }
  }

  const cluster = points.slice(clusterStart);
  if (cluster.length > MAX_LOGO_CODE_POINTS) return null;
  if (!cluster.every((cp) => isEmojiBase(cp) || isCombiner(cp) || cp === ZWJ)) return null;

  return String.fromCodePoint(...cluster);
}
