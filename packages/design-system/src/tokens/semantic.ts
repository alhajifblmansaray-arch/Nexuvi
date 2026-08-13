/**
 * Layer 2 — semantic tokens.
 *
 * Role-based aliases over the primitives. **Components reference only this layer.** A
 * component that names a primitive directly has hardcoded a decision that tenant theming
 * and dark mode both need to be able to change, so that is a lint error (see
 * `docs/adr/0002-brand-tokens-and-tenant-theming.md`).
 */

import { primitives } from './primitives.ts';

const { color } = primitives;

/**
 * Every semantic colour token in the system.
 *
 * The `clinical*` group is separate from the `status*` group on purpose. `statusDanger` is
 * the generic UI colour for a failed save or a destructive button, and blueprint §3.3 lets
 * a tenant rebind it. `clinicalCritical` and `clinicalAllergy` signal patient-safety state
 * under §19.1 and are locked platform-wide. Collapsing the two groups would let a clinic's
 * brand choice quietly restyle an allergy banner.
 */
export const SEMANTIC_COLOR_TOKENS = [
  // Surfaces
  'surfacePage',
  'surfaceRaised',
  'surfaceSunken',
  'surfaceOverlay',
  'surfaceHover',
  'surfaceSelected',
  'surfaceDisabled',

  // Text
  'textPrimary',
  'textSecondary',
  'textMuted',
  'textDisabled',
  'textOnAction',
  'textOnStatus',
  'textLink',

  // Borders and separators
  'borderSubtle',
  'borderDefault',
  'borderStrong',
  'borderFocus',

  // Primary action — tenant-overridable
  'actionPrimary',
  'actionPrimaryHover',
  'actionPrimaryActive',
  'actionPrimarySubtle',

  // Secondary / accent — tenant-overridable
  'actionSecondary',
  'actionSecondaryHover',
  'actionSecondarySubtle',

  // Generic UI status — tenant-overridable
  'statusSuccess',
  'statusSuccessSubtle',
  'statusWarning',
  'statusWarningSubtle',
  'statusDanger',
  'statusDangerSubtle',
  'statusInfo',
  'statusInfoSubtle',

  // Clinical safety — LOCKED, never tenant-overridable (§19.1)
  'clinicalCritical',
  'clinicalCriticalSubtle',
  'clinicalAllergy',
  'clinicalAllergySubtle',
  'clinicalControlled',
  'clinicalSensitive',
  'clinicalBreakGlass',

  // Platform state — LOCKED. Offline and support-session indicators must look identical
  // in every tenant, so staff read them the same way across employers (§15.3, §16.3).
  'platformOffline',
  'platformSyncPending',
  'platformSupportSession',
] as const;

export type SemanticColorToken = (typeof SEMANTIC_COLOR_TOKENS)[number];

export type SemanticColorTheme = Readonly<Record<SemanticColorToken, string>>;

/**
 * Default light theme. The baseline every tenant override starts from.
 *
 * Note that the action layer is pure neutral. Nexuvi ships without a brand hue in the
 * primary-action slot on purpose — see the header of `primitives.ts`.
 */
export const lightTheme: SemanticColorTheme = {
  surfacePage: color.neutral[50],
  surfaceRaised: '#ffffff',
  surfaceSunken: color.neutral[100],
  surfaceOverlay: '#ffffff',
  surfaceHover: color.neutral[100],
  surfaceSelected: color.accent[50],
  surfaceDisabled: color.neutral[100],

  textPrimary: color.neutral[900],
  textSecondary: color.neutral[700],
  textMuted: color.neutral[600],
  textDisabled: color.neutral[400],
  textOnAction: '#ffffff',
  textOnStatus: '#ffffff',
  textLink: color.accent[700],

  borderSubtle: color.neutral[200],
  borderDefault: color.neutral[300],
  borderStrong: color.neutral[500],
  borderFocus: color.accent[500],

  // Near-black, lightening on hover rather than darkening — at step 900 there is nowhere
  // darker to go, and lifting toward 800 reads as the surface coming up to meet the cursor.
  actionPrimary: color.neutral[900],
  actionPrimaryHover: color.neutral[800],
  actionPrimaryActive: color.neutral[700],
  actionPrimarySubtle: color.neutral[100],

  actionSecondary: color.neutral[700],
  actionSecondaryHover: color.neutral[800],
  actionSecondarySubtle: color.neutral[100],

  statusSuccess: color.mint[600],
  statusSuccessSubtle: color.mint[50],
  statusWarning: color.amber[600],
  statusWarningSubtle: color.amber[50],
  statusDanger: color.rose[600],
  statusDangerSubtle: color.rose[50],
  statusInfo: color.accent[600],
  statusInfoSubtle: color.accent[50],

  clinicalCritical: color.clinicalAlert[600],
  clinicalCriticalSubtle: color.clinicalAlert[50],
  clinicalAllergy: color.clinicalAlert[700],
  clinicalAllergySubtle: color.clinicalAlert[100],
  clinicalControlled: color.accent[800],
  clinicalSensitive: color.neutral[800],
  clinicalBreakGlass: color.clinicalAlert[800],

  platformOffline: color.neutral[600],
  platformSyncPending: color.amber[600],
  platformSupportSession: color.accent[700],
};

/**
 * Default dark theme.
 *
 * Not a mechanical inversion. Ward, theatre, and night-shift use is a real setting for
 * this product, and saturated colour on a dark surface reads brighter than the same
 * colour on white — so status and clinical colours step *lighter* here to hold their
 * contrast ratio without glaring.
 */
export const darkTheme: SemanticColorTheme = {
  surfacePage: color.neutral[900],
  surfaceRaised: color.neutral[800],
  surfaceSunken: '#0b0d0f',
  surfaceOverlay: color.neutral[800],
  surfaceHover: color.neutral[700],
  surfaceSelected: color.accent[900],
  surfaceDisabled: color.neutral[800],

  textPrimary: color.neutral[50],
  textSecondary: color.neutral[300],
  textMuted: color.neutral[400],
  textDisabled: color.neutral[600],
  // The primary action inverts to near-white here, so its label inverts to near-black.
  textOnAction: color.neutral[900],
  textOnStatus: color.neutral[900],
  textLink: color.accent[300],

  borderSubtle: color.neutral[800],
  borderDefault: color.neutral[700],
  borderStrong: color.neutral[500],
  borderFocus: color.accent[300],

  actionPrimary: color.neutral[50],
  actionPrimaryHover: '#ffffff',
  actionPrimaryActive: color.neutral[200],
  actionPrimarySubtle: color.neutral[800],

  actionSecondary: color.neutral[300],
  actionSecondaryHover: color.neutral[200],
  actionSecondarySubtle: color.neutral[800],

  statusSuccess: color.mint[300],
  statusSuccessSubtle: color.mint[900],
  statusWarning: color.amber[300],
  statusWarningSubtle: color.amber[900],
  statusDanger: color.rose[300],
  statusDangerSubtle: color.rose[900],
  statusInfo: color.accent[300],
  statusInfoSubtle: color.accent[900],

  clinicalCritical: color.clinicalAlert[300],
  clinicalCriticalSubtle: color.clinicalAlert[900],
  clinicalAllergy: color.clinicalAlert[200],
  clinicalAllergySubtle: color.clinicalAlert[900],
  clinicalControlled: color.accent[200],
  clinicalSensitive: color.neutral[200],
  clinicalBreakGlass: color.clinicalAlert[200],

  platformOffline: color.neutral[400],
  platformSyncPending: color.amber[300],
  platformSupportSession: color.accent[300],
};

/** CSS custom property name for a semantic token: `actionPrimary` → `--nx-color-action-primary`. */
export function cssVarName(token: SemanticColorToken): string {
  const kebab = token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return `--nx-color-${kebab}`;
}
