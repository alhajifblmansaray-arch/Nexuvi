/**
 * Layer 1 — primitives.
 *
 * The raw Nexuvi brand. Fixed values, no semantics, no tenant access. Components must
 * never reference this module directly; they consume the semantic layer, which is what
 * makes tenant theming and dark mode possible without touching a single component.
 *
 * ## Direction
 *
 * Monochrome base, colour only where it carries meaning, softer and rounder than the
 * incumbent practice-management software it sits beside.
 *
 * Two consequences worth stating, because they are decisions rather than taste:
 *
 * - **The neutral ramp is the brand.** There is no Nexuvi brand hue in the action layer.
 *   Primary actions are near-black. This is partly the look asked for, and partly
 *   structural: §3.3 gives every tenant its own brand colour, so a strong Nexuvi hue in
 *   the same slot would either fight the clinic's branding or be immediately overwritten.
 *   A neutral platform lets tenant colour be the only colour in the room.
 * - **Chroma is rationed.** Accents exist for status, selection, and clinical signalling.
 *   When six things on screen are coloured, none of them are urgent — and this interface
 *   has to make a critical result unmissable at the end of a twelve-hour shift.
 *
 * Values below are derived from the supplied reference dashboards. Still outstanding:
 * logo and favicon assets, and confirmation of the typeface (see ADR-0002).
 */

/**
 * A 10-step ramp. 50 is lightest, 900 darkest. Steps are chosen so that a foreground at
 * step N clears AA body text on a background at step N±500 or beyond — this invariant is
 * what lets the semantic layer be assembled by rule rather than by eye.
 */
export interface ColorRamp {
  readonly 50: string;
  readonly 100: string;
  readonly 200: string;
  readonly 300: string;
  readonly 400: string;
  readonly 500: string;
  readonly 600: string;
  readonly 700: string;
  readonly 800: string;
  readonly 900: string;
}

/**
 * The Nexuvi neutral. Very slightly cool, so that white surfaces read as clean rather
 * than yellowed under the fluorescent lighting most of these screens live under.
 * Carries the entire interface.
 */
const neutral: ColorRamp = {
  50: '#fafafa',
  100: '#f4f5f6',
  200: '#e8eaec',
  300: '#d5d8dc',
  400: '#adb3ba',
  500: '#7c848d',
  600: '#5c646d',
  700: '#414850',
  800: '#272c32',
  900: '#131619',
};

/**
 * Accent — a soft lavender. The single non-status colour in the system, spent on
 * selection, links, focus, and informational state. Chosen because it is distinct from
 * every clinical signal colour: nothing in the safety palette is violet, so an accent
 * highlight can never be misread as a warning.
 */
const accent: ColorRamp = {
  50: '#f6f2fd',
  100: '#ebe3fa',
  200: '#d8c8f5',
  300: '#bfa6ec',
  400: '#a382df',
  500: '#8763cb',
  600: '#6d4bad',
  700: '#573b8b',
  800: '#422d69',
  900: '#2c1e46',
};

/** Positive / success. */
const mint: ColorRamp = {
  50: '#ecfaf5',
  100: '#cdf2e6',
  200: '#9ce5cf',
  300: '#63d3b4',
  400: '#33bf9c',
  500: '#19a183',
  600: '#0f8169',
  700: '#0c6553',
  800: '#094d40',
  900: '#06332b',
};

/** Caution / warning. */
const amber: ColorRamp = {
  50: '#fdf8ea',
  100: '#faedc8',
  200: '#f4dc96',
  300: '#eac961',
  400: '#d9b03c',
  500: '#b8922c',
  600: '#947420',
  700: '#745a1a',
  800: '#574415',
  900: '#3a2d0e',
};

/** Negative / danger / destructive. Generic UI failure, not clinical risk. */
const rose: ColorRamp = {
  50: '#fdf2f2',
  100: '#fbdfdf',
  200: '#f6bdbd',
  300: '#ee9494',
  400: '#e06c6c',
  500: '#cc4e4e',
  600: '#ab3a3a',
  700: '#882d2d',
  800: '#682323',
  900: '#461818',
};

/**
 * Reserved for clinical-safety signalling only (§19.1). Deliberately a distinct hue from
 * `rose`, not an alias of it: the generic UI "error" colour is tenant-overridable per
 * §3.3, while critical-result and allergy signalling must not be. Sharing a ramp would
 * let the safety token silently inherit a tenant override.
 *
 * The warm coral also reads as distinct from `rose` for the ~8% of male staff with
 * red-green colour vision deficiency, for whom a second red would be a second red.
 */
const clinicalAlert: ColorRamp = {
  50: '#fff3ee',
  100: '#ffe0d3',
  200: '#ffbc9f',
  300: '#fb9366',
  400: '#f07039',
  500: '#d85620',
  600: '#b34418',
  700: '#8d3613',
  800: '#6b290f',
  900: '#471c0a',
};

export const primitives = {
  color: { neutral, accent, mint, amber, rose, clinicalAlert },

  /**
   * Type scale. Clinical density matters — a chart header showing patient name,
   * identifier, age, allergy status, and location (§19.1) has to fit without truncation,
   * so the lower end of this scale is tighter than a marketing site would use.
   */
  fontSize: {
    xs: '0.75rem',
    sm: '0.8125rem',
    base: '0.875rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.375rem',
    '2xl': '1.75rem',
    '3xl': '2.25rem',
    '4xl': '3rem',
  },

  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },

  lineHeight: {
    tight: '1.2',
    snug: '1.35',
    normal: '1.5',
    relaxed: '1.65',
  },

  /**
   * PENDING CONFIRMATION — the reference dashboards use a neutral grotesque. Leading with
   * Inter, falling back to the system stack. Nothing here is self-hosted yet; that has to
   * happen before launch, because §15 offline-capable surfaces cannot depend on a font CDN
   * and a clinic on a bad connection should not watch its patient list reflow.
   */
  fontFamily: {
    sans: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    /** Tabular figures for identifiers, doses, and money. */
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
  },

  /** 4px base unit. */
  space: {
    0: '0',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    8: '2rem',
    10: '2.5rem',
    12: '3rem',
    16: '4rem',
    20: '5rem',
    24: '6rem',
  },

  /**
   * Generous by intent — this is most of where "softer" comes from. Cards sit at `lg`,
   * controls at `md`, badges and chips at `full`.
   *
   * `sm` exists for one reason: elements that tile edge-to-edge, such as table cells and
   * calendar slots, where a large radius produces visible gaps between neighbours rather
   * than a soft edge.
   */
  radius: {
    none: '0',
    sm: '0.375rem',
    md: '0.625rem',
    lg: '1rem',
    xl: '1.25rem',
    '2xl': '1.75rem',
    full: '9999px',
  },

  /**
   * Wide and faint rather than tight and dark. A tight shadow reads as a hard edge, which
   * is the look we are moving away from.
   */
  shadow: {
    xs: '0 1px 2px 0 rgb(19 22 25 / 0.04)',
    sm: '0 2px 6px -1px rgb(19 22 25 / 0.06), 0 1px 2px 0 rgb(19 22 25 / 0.04)',
    md: '0 6px 16px -4px rgb(19 22 25 / 0.08), 0 2px 6px -2px rgb(19 22 25 / 0.05)',
    lg: '0 16px 32px -8px rgb(19 22 25 / 0.10), 0 4px 10px -4px rgb(19 22 25 / 0.06)',
    overlay: '0 24px 64px -12px rgb(19 22 25 / 0.18)',
  },

  /**
   * Motion. Kept short by intent: staff use this software all day, and animation that
   * reads as polished on the third viewing reads as latency on the three-hundredth.
   * All durations must be suppressed under `prefers-reduced-motion`.
   */
  duration: {
    instant: '0ms',
    fast: '120ms',
    normal: '200ms',
    slow: '320ms',
  },

  easing: {
    standard: 'cubic-bezier(0.2, 0, 0.13, 1)',
    decelerate: 'cubic-bezier(0, 0, 0.13, 1)',
    accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;

export type Primitives = typeof primitives;
