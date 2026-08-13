/**
 * Colour parsing and WCAG 2.2 contrast maths.
 *
 * Everything tenant-supplied enters the system through {@link parseColor}. Nothing that
 * fails to parse is ever stored, and nothing is interpolated into a stylesheet as a raw
 * string — that is the CSS-injection path blueprint §3.3 closes by forbidding arbitrary
 * tenant CSS.
 */

/** An sRGB colour, each channel 0–255. The only colour representation we persist. */
export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Parse a hex colour string. Returns `null` rather than throwing, because the common
 * caller is validation of untrusted tenant input where a failure is an expected outcome.
 *
 * Accepts `#abc`, `#aabbcc`, and the same without the leading `#`. Deliberately does not
 * accept `rgb()`, `hsl()`, named colours, or anything else: a narrow accepted grammar is
 * the point, not a convenience gap.
 */
export function parseColor(input: string): Color | null {
  const match = HEX_PATTERN.exec(input.trim());
  if (!match) return null;

  let hex = match[1]!;
  if (hex.length === 3) {
    hex = `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

/** Serialise back to a canonical lowercase `#rrggbb` string. */
export function formatColor(color: Color): string {
  const channel = (value: number) => value.toString(16).padStart(2, '0');
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

/**
 * Relative luminance per WCAG 2.x.
 * https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 */
export function relativeLuminance(color: Color): number {
  const linearize = (channel8Bit: number): number => {
    const channel = channel8Bit / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b)
  );
}

/**
 * Contrast ratio between two colours, from 1 (identical) to 21 (black on white).
 * Order-independent.
 */
export function contrastRatio(a: Color, b: Color): number {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The contrast thresholds we enforce, per blueprint §30 (WCAG 2.2 AA). */
export const CONTRAST_THRESHOLDS = {
  /** Body text and any text below 18.66px regular / 14px bold. */
  bodyText: 4.5,
  /** Text at or above 18.66px regular / 14px bold. */
  largeText: 3,
  /** Icons, focus rings, input borders, and other non-text affordances. */
  nonText: 3,
} as const;

export type ContrastRequirement = keyof typeof CONTRAST_THRESHOLDS;

/** Whether `foreground` on `background` clears the AA threshold for `requirement`. */
export function meetsContrast(
  foreground: Color,
  background: Color,
  requirement: ContrastRequirement,
): boolean {
  return contrastRatio(foreground, background) >= CONTRAST_THRESHOLDS[requirement];
}
