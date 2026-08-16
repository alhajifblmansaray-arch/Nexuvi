/**
 * Tenant configuration — the layer a clinic customises for itself.
 *
 * Everything here is **data, not code**. One deployment serves every tenant; a clinic's
 * portal differs from another's because this record differs, not because a different
 * bundle was built for them. That is what makes a security fix one deploy instead of two
 * hundred, and it is what makes it structurally impossible for a clinic to edit a clinical
 * safety component "to match the brand".
 *
 * ## What a tenant may and may not change
 *
 * A clinic sets its six brand slots, its logo, its wording, and which optional sections
 * appear. It cannot set the `clinical*` tokens — allergy, critical result, controlled
 * substance, break-glass (§19.1). Those are locked platform-wide so a warning looks the
 * same to a patient whichever clinic they are registered at. `LOCKED_TOKENS` in the design
 * system is the enforcement; this comment is only the reason.
 *
 * ## Draft and published
 *
 * A clinic edits a draft and publishes atomically. Nothing half-edited ever reaches a
 * patient — a portal that renders a clinic mid-rebrand is worse than one that renders
 * yesterday's brand.
 */

import type { IsoTimestamp } from './common.ts';

export type ConfigStatus = 'draft' | 'published';

/**
 * The six brand slots, as hex strings.
 *
 * Validated against WCAG contrast before it can be published: `resolveTenantTheme` rejects
 * a colour that cannot carry readable text and suggests the nearest shade that can. A
 * clinic's brand is honoured up to the point where honouring it would make text
 * unreadable — and no further.
 */
export interface TenantBranding {
  readonly primary?: string;
  readonly secondary?: string;
  readonly success?: string;
  readonly warning?: string;
  readonly danger?: string;
  readonly info?: string;
  /** Absolute URL on the asset origin. Never inline markup — see the note on SVG below. */
  readonly logoUrl?: string;
  readonly logoDarkUrl?: string;
  /** Chosen from a platform-provided list, not an arbitrary font URL. */
  readonly typeface?: 'inter' | 'source-sans' | 'ibm-plex' | 'system';
}

/** How a clinic describes itself. Plain text — rendered as text, never as markup. */
export interface ClinicProfile {
  readonly displayName: string;
  readonly tagline?: string;
  readonly about?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly addressLines?: readonly string[];
  readonly openingHours?: readonly { readonly day: string; readonly hours: string }[];
  /** Emergency guidance shown on every portal page. */
  readonly emergencyNotice?: string;
}

/**
 * Sections a clinic may switch on or off in its patient portal.
 *
 * A closed set, deliberately. Composing from blocks the platform ships is the difference
 * between a flexible portal and an XSS hole in an application holding patient records.
 */
export type PortalSection =
  | 'appointments'
  | 'visits'
  | 'results'
  | 'medications'
  | 'documents'
  | 'messages'
  | 'billing';

export interface PortalConfig {
  /** Sections to render, in order. Unknown values are ignored rather than trusted. */
  readonly sections: readonly PortalSection[];
  readonly welcomeHeading?: string;
  readonly welcomeBody?: string;
  /** Shown when a patient has no upcoming appointment. */
  readonly bookingInstructions?: string;
}

/** A hostname routed to this tenant. */
export interface TenantDomain {
  readonly host: string;
  /** Platform subdomains are trusted on creation; custom domains require DNS proof. */
  readonly verified: boolean;
  readonly primary: boolean;
}

export interface TenantConfig {
  readonly tenantId: string;
  readonly version: number;
  readonly status: ConfigStatus;
  readonly branding: TenantBranding;
  readonly profile: ClinicProfile;
  readonly portal: PortalConfig;
  readonly domains: readonly TenantDomain[];
  readonly updatedAt: IsoTimestamp;
}

/**
 * What the portal actually renders — a resolved, publish-ready view.
 *
 * Branding arrives as **emitted CSS custom properties**, already contrast-validated and
 * colour-parsed server-side. The client never receives a raw tenant colour string to drop
 * into a stylesheet: that is a CSS injection vector, and `UnsafeThemeValueError` exists to
 * make it impossible to emit one by accident.
 */
export interface ResolvedPortalBrand {
  readonly tenantId: string;
  /** Slug used to scope the stylesheet, matching `data-tenant-theme`. */
  readonly themeKey: string;
  readonly stylesheet: string;
  readonly logoUrl: string | null;
  readonly logoDarkUrl: string | null;
  readonly typeface: NonNullable<TenantBranding['typeface']>;
  readonly profile: ClinicProfile;
  readonly portal: PortalConfig;
}

/** A branding change a clinic tried to publish, and why it was refused. */
export interface BrandingIssue {
  readonly slot: string;
  readonly reason: string;
  /** Nearest shade of their colour that would pass. */
  readonly suggestion?: string;
}
