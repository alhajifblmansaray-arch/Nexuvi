import { Injectable, NotFoundException } from '@nestjs/common';
import {
  resolveTenantTheme,
  toTenantStylesheet,
  type TenantBrandInput,
} from '@nexuvi/design-system';
import type { BrandingIssue, ResolvedPortalBrand } from '@nexuvi/api-contracts';

import { draftFor, tenantConfigStore } from '../../infrastructure/persistence/tenant-config-store';

/**
 * Turns a clinic's saved branding into something safe to render.
 *
 * Three things happen here, and the order matters:
 *
 * 1. **Validate.** `resolveTenantTheme` checks every brand colour against WCAG contrast on
 *    both light and dark surfaces, and reports every failure at once with the nearest shade
 *    that would pass. A clinic's brand is honoured up to the point where honouring it makes
 *    text unreadable.
 * 2. **Fall back, loudly.** If a saved palette no longer validates, the platform default is
 *    served and the issues are reported — rather than shipping unreadable text because a
 *    clinic once saved a pale yellow.
 * 3. **Emit CSS server-side.** The portal receives a finished stylesheet, never raw colour
 *    strings. A tenant-supplied value interpolated into CSS on the client is an injection
 *    vector; `toCssCustomProperties` re-parses every colour and throws
 *    `UnsafeThemeValueError` rather than emitting anything it cannot prove is a colour.
 *
 * The locked `clinical*` tokens are never in the tenant's input set at all (§19.1), so an
 * allergy warning looks identical at every clinic on the platform.
 */
@Injectable()
export class BrandingService {
  /** The published, render-ready brand for a tenant. What patients see. */
  resolve(tenantId: string): ResolvedPortalBrand {
    return this.render(tenantId, tenantConfigStore.published(tenantId));
  }

  /**
   * Brand for **staff** surfaces, falling back to the draft.
   *
   * The staff sign-in screen has to work before a clinic has published anything — someone
   * must be able to log in in order to do the publishing. Patients never reach this path,
   * so showing them an unfinished configuration is not a risk here; showing an
   * administrator a locked door would be.
   */
  resolveForStaff(tenantId: string): ResolvedPortalBrand {
    return this.render(tenantId, tenantConfigStore.published(tenantId) ?? draftFor(tenantId));
  }

  private render(
    tenantId: string,
    config: ReturnType<typeof tenantConfigStore.published>,
  ): ResolvedPortalBrand {
    const themeKey = tenantConfigStore.themeKeyFor(tenantId);

    if (!config || !themeKey) {
      throw new NotFoundException('This clinic has not published a portal yet.');
    }

    const { branding, profile, portal } = config;

    const input: TenantBrandInput = {
      ...(branding.primary ? { primary: branding.primary } : {}),
      ...(branding.secondary ? { secondary: branding.secondary } : {}),
      ...(branding.success ? { success: branding.success } : {}),
      ...(branding.warning ? { warning: branding.warning } : {}),
      ...(branding.danger ? { danger: branding.danger } : {}),
      ...(branding.info ? { info: branding.info } : {}),
    };

    const resolution = resolveTenantTheme(input);

    // An invalid saved palette degrades to the platform theme rather than to unreadable
    // text. The clinic's own brand editor is where the issues get surfaced and fixed.
    const themes = resolution.ok
      ? { light: resolution.light, dark: resolution.dark }
      : defaultThemes();

    return {
      tenantId,
      themeKey,
      stylesheet: toTenantStylesheet(themeKey, themes),
      logoUrl: branding.logoUrl ?? null,
      logoDarkUrl: branding.logoDarkUrl ?? null,
      typeface: branding.typeface ?? 'system',
      profile,
      portal,
    };
  }

  /**
   * Validate a palette without saving it — what the brand editor calls on every keystroke.
   *
   * Returns the reason *and* a workable suggestion, so an administrator adjusts their
   * colour rather than being told no.
   */
  validate(input: TenantBrandInput): readonly BrandingIssue[] {
    const resolution = resolveTenantTheme(input);
    if (resolution.ok) return [];

    return resolution.issues.map((issue) => ({
      slot: issue.slot,
      reason: issue.message,
      ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
    }));
  }
}

/** The platform theme, which is always valid by construction. */
function defaultThemes() {
  const resolution = resolveTenantTheme({});
  if (!resolution.ok) {
    // Unreachable: the platform's own palette is contrast-tested in the design system.
    throw new Error('The platform default theme failed contrast validation.');
  }
  return { light: resolution.light, dark: resolution.dark };
}
