/**
 * Layer 3 — tenant overrides.
 *
 * Blueprint §3.3 lets an organization configure "primary, secondary, neutral, success,
 * warning, and error colors within accessibility limits", and explicitly forbids tenants
 * uploading executable code or arbitrary CSS. This module is the whole of that contract.
 *
 * Two design choices worth stating, because they are not the obvious ones:
 *
 * 1. **Tenants supply six base colours, not forty tokens.** Hover, active, and subtle
 *    variants are derived. A clinic administrator picking their brand green should not be
 *    asked to nominate a pressed-state green, and letting them would create forty
 *    independent ways to produce an unreadable interface instead of six.
 *
 * 2. **Validation runs server-side and rejects, it does not repair.** Silently correcting
 *    a tenant's unreadable colour would mean their portal does not match the brand they
 *    configured, and they would not know why. Tell them, and let them choose again.
 */

import {
  SEMANTIC_COLOR_TOKENS,
  type SemanticColorTheme,
  type SemanticColorToken,
  lightTheme,
  darkTheme,
} from '../tokens/semantic.ts';
import {
  type Color,
  CONTRAST_THRESHOLDS,
  contrastRatio,
  formatColor,
  parseColor,
} from './color.ts';

/** The six brand slots a tenant may set. All optional; anything omitted keeps the Nexuvi default. */
export interface TenantBrandInput {
  readonly primary?: string;
  readonly secondary?: string;
  readonly success?: string;
  readonly warning?: string;
  readonly danger?: string;
  readonly info?: string;
}

export type TenantBrandSlot = keyof TenantBrandInput;

export const TENANT_BRAND_SLOTS: readonly TenantBrandSlot[] = [
  'primary',
  'secondary',
  'success',
  'warning',
  'danger',
  'info',
] as const;

/**
 * Semantic tokens a tenant can influence, directly or by derivation. Everything in
 * {@link SEMANTIC_COLOR_TOKENS} and not in here is locked platform-wide — notably the
 * whole `clinical*` group (§19.1) and the `platform*` group (§15.3, §16.3).
 */
export const TENANT_OVERRIDABLE_TOKENS: ReadonlySet<SemanticColorToken> = new Set([
  'actionPrimary',
  'actionPrimaryHover',
  'actionPrimaryActive',
  'actionPrimarySubtle',
  'actionSecondary',
  'actionSecondaryHover',
  'actionSecondarySubtle',
  'statusSuccess',
  'statusSuccessSubtle',
  'statusWarning',
  'statusWarningSubtle',
  'statusDanger',
  'statusDangerSubtle',
  'statusInfo',
  'statusInfoSubtle',
  'textOnAction',
  'textLink',
  'surfaceSelected',
  'borderFocus',
]);

/** Tokens that carry clinical or platform meaning and are never tenant-settable. */
export const LOCKED_TOKENS: readonly SemanticColorToken[] = SEMANTIC_COLOR_TOKENS.filter(
  (token) => !TENANT_OVERRIDABLE_TOKENS.has(token),
);

// ---------------------------------------------------------------------------
// Shade derivation
// ---------------------------------------------------------------------------

/** Blend two colours in linear-light space, which keeps mid-blends from muddying. */
function mix(a: Color, b: Color, amount: number): Color {
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const toSrgb = (v: number) => {
    const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255);
  };
  const blend = (ca: number, cb: number) =>
    toSrgb(toLinear(ca) * (1 - amount) + toLinear(cb) * amount);

  return { r: blend(a.r, b.r), g: blend(a.g, b.g), b: blend(a.b, b.b) };
}

const BLACK: Color = { r: 0, g: 0, b: 0 };
const WHITE: Color = { r: 255, g: 255, b: 255 };

const darken = (color: Color, amount: number) => mix(color, BLACK, amount);
const lighten = (color: Color, amount: number) => mix(color, WHITE, amount);

/**
 * Pick whichever of white or near-black text clears AA on the given background, preferring
 * the higher ratio. Returns `null` when neither does, which means the colour cannot carry
 * text and the override must be rejected.
 */
function readableTextOn(background: Color): Color | null {
  const nearBlack: Color = { r: 23, g: 27, b: 31 };
  const whiteRatio = contrastRatio(WHITE, background);
  const blackRatio = contrastRatio(nearBlack, background);
  const best = whiteRatio >= blackRatio ? WHITE : nearBlack;
  const bestRatio = Math.max(whiteRatio, blackRatio);
  return bestRatio >= CONTRAST_THRESHOLDS.bodyText ? best : null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface TenantThemeIssue {
  readonly slot: TenantBrandSlot;
  readonly code: 'unparseable' | 'insufficient-contrast' | 'no-readable-text';
  readonly message: string;
  /** Present for contrast failures, so the admin UI can show how far off the value is. */
  readonly actualRatio?: number;
  readonly requiredRatio?: number;
  /**
   * The nearest shade of the same hue that would pass, when one exists.
   *
   * We reject rather than silently repair (see the module header), but rejecting a
   * clinic's brand colour with nothing but a contrast ratio is a dead end for the
   * administrator on the other side of it. Offering the closest workable shade keeps the
   * decision theirs while making it actionable.
   */
  readonly suggestion?: string;
}

/** Why a candidate brand colour cannot be used, or `null` if it can. */
function rejectBrandColor(
  color: Color,
  carriesText: boolean,
): { code: 'insufficient-contrast' | 'no-readable-text'; actual: number; required: number } | null {
  const pageBackground = parseColor(lightTheme.surfacePage)!;
  const againstPage = contrastRatio(color, pageBackground);
  if (againstPage < CONTRAST_THRESHOLDS.nonText) {
    return {
      code: 'insufficient-contrast',
      actual: againstPage,
      required: CONTRAST_THRESHOLDS.nonText,
    };
  }

  if (carriesText && readableTextOn(color) === null) {
    return {
      code: 'no-readable-text',
      actual: Math.max(contrastRatio(WHITE, color), contrastRatio(BLACK, color)),
      required: CONTRAST_THRESHOLDS.bodyText,
    };
  }

  return null;
}

/**
 * Walk the colour toward black, then toward white, and return the first shade that passes.
 * Darker is tried first: a brand colour that fails is usually too pale for a filled
 * control on a near-white page, and darkening preserves the hue a tenant actually chose.
 */
function suggestNearest(color: Color, carriesText: boolean): Color | null {
  for (const direction of [BLACK, WHITE]) {
    for (let amount = 0.05; amount <= 0.9; amount += 0.05) {
      const candidate = mix(color, direction, amount);
      if (rejectBrandColor(candidate, carriesText) === null) return candidate;
    }
  }
  return null;
}

export type TenantThemeResolution =
  | { readonly ok: true; readonly light: SemanticColorTheme; readonly dark: SemanticColorTheme }
  | { readonly ok: false; readonly issues: readonly TenantThemeIssue[] };

interface SlotRule {
  /** Semantic token receiving the tenant's base colour. */
  readonly base: SemanticColorToken;
  readonly hover?: SemanticColorToken;
  readonly active?: SemanticColorToken;
  readonly subtle?: SemanticColorToken;
  /**
   * When true, this colour is used behind text (a filled button), so it must be able to
   * carry a readable foreground. When false it is only ever a border, icon, or accent bar,
   * and the lower non-text threshold applies.
   */
  readonly carriesText: boolean;
}

const SLOT_RULES: Readonly<Record<TenantBrandSlot, SlotRule>> = {
  primary: {
    base: 'actionPrimary',
    hover: 'actionPrimaryHover',
    active: 'actionPrimaryActive',
    subtle: 'actionPrimarySubtle',
    carriesText: true,
  },
  secondary: {
    base: 'actionSecondary',
    hover: 'actionSecondaryHover',
    subtle: 'actionSecondarySubtle',
    carriesText: true,
  },
  success: { base: 'statusSuccess', subtle: 'statusSuccessSubtle', carriesText: true },
  warning: { base: 'statusWarning', subtle: 'statusWarningSubtle', carriesText: true },
  danger: { base: 'statusDanger', subtle: 'statusDangerSubtle', carriesText: true },
  info: { base: 'statusInfo', subtle: 'statusInfoSubtle', carriesText: true },
};

/**
 * Validate a tenant's brand input and resolve it into complete light and dark themes.
 *
 * Returns every issue found rather than stopping at the first, so an administrator fixes
 * their palette in one pass instead of six.
 */
export function resolveTenantTheme(input: TenantBrandInput): TenantThemeResolution {
  const issues: TenantThemeIssue[] = [];
  const light: Record<string, string> = { ...lightTheme };
  const dark: Record<string, string> = { ...darkTheme };

  for (const slot of TENANT_BRAND_SLOTS) {
    const raw = input[slot];
    if (raw === undefined || raw.trim() === '') continue;

    const color = parseColor(raw);
    if (!color) {
      issues.push({
        slot,
        code: 'unparseable',
        message: `${slot}: expected a hex colour such as #2d7f6d, received ${JSON.stringify(raw)}.`,
      });
      continue;
    }

    const rule = SLOT_RULES[slot];
    const rejection = rejectBrandColor(color, rule.carriesText);

    if (rejection) {
      const suggested = suggestNearest(color, rule.carriesText);
      const explanation =
        rejection.code === 'insufficient-contrast'
          ? `${formatColor(color)} is too close to the page background to be distinguishable`
          : `no text colour reaches WCAG AA on ${formatColor(color)} — mid-tone colours ` +
            `commonly fail, being too dark for black text and too light for white`;

      issues.push({
        slot,
        code: rejection.code,
        message:
          `${slot}: ${explanation}.` +
          (suggested ? ` The nearest shade that works is ${formatColor(suggested)}.` : ''),
        actualRatio: Number(rejection.actual.toFixed(2)),
        requiredRatio: rejection.required,
        ...(suggested ? { suggestion: formatColor(suggested) } : {}),
      });
      continue;
    }

    if (rule.carriesText && slot === 'primary') {
      light.textOnAction = formatColor(readableTextOn(color)!);
    }

    light[rule.base] = formatColor(color);
    if (rule.hover) light[rule.hover] = formatColor(darken(color, 0.12));
    if (rule.active) light[rule.active] = formatColor(darken(color, 0.24));
    if (rule.subtle) light[rule.subtle] = formatColor(lighten(color, 0.9));

    // Dark theme: lift the tenant colour so it holds contrast on a dark surface without
    // glaring. Same brand hue, appropriate luminance for the surface it sits on.
    const darkBase = lighten(color, 0.4);
    dark[rule.base] = formatColor(darkBase);
    if (rule.hover) dark[rule.hover] = formatColor(lighten(color, 0.55));
    if (rule.active) dark[rule.active] = formatColor(lighten(color, 0.68));
    if (rule.subtle) dark[rule.subtle] = formatColor(darken(color, 0.55));
    if (rule.carriesText && slot === 'primary') {
      const darkForeground = readableTextOn(darkBase);
      if (darkForeground) dark.textOnAction = formatColor(darkForeground);
    }

    if (slot === 'primary') {
      light.textLink = formatColor(darken(color, 0.1));
      light.borderFocus = formatColor(color);
      light.surfaceSelected = formatColor(lighten(color, 0.92));
      dark.textLink = formatColor(lighten(color, 0.55));
      dark.borderFocus = formatColor(lighten(color, 0.5));
      dark.surfaceSelected = formatColor(darken(color, 0.6));
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    light: light as SemanticColorTheme,
    dark: dark as SemanticColorTheme,
  };
}
