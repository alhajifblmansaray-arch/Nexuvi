import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Patch,
  Post,
} from '@nestjs/common';
import type { BrandingIssue, TenantConfig } from '@nexuvi/api-contracts';

import { UpdateDraftDto } from './dto';
import { BrandingService } from './branding.service';
import { RequirePermission } from '../../infrastructure/identity/permission.guard';
import { PERMISSIONS } from '../../infrastructure/identity/permissions';
import { requirePrincipal } from '../../infrastructure/context/request-context';
import {
  draftFor,
  publishTenantConfig,
  updateDraft,
} from '../../infrastructure/persistence/tenant-config-store';

/**
 * A clinic's own configuration.
 *
 * Tenant-scoped, not platform-scoped: a clinic edits *its own* portal. The tenant comes
 * from the session, so these endpoints take no tenant parameter at all and there is no
 * path for one customer to edit another's configuration.
 *
 * Editing and publishing are separate on purpose. A clinic works on a draft for as long as
 * it takes; patients keep seeing the last published version until someone decides the new
 * one is ready.
 */
@Controller('tenant-config')
export class TenantConfigController {
  constructor(private readonly branding: BrandingService) {}

  /** The working copy. Forked from the published version on first read. */
  @RequirePermission(PERMISSIONS.CONFIG_WRITE)
  @Get('draft')
  draft(): TenantConfig {
    const draft = draftFor(requirePrincipal().tenantId);
    if (!draft) {
      throw new NotFoundException('This organisation has no configuration yet.');
    }
    return draft;
  }

  /**
   * Check a palette without saving it.
   *
   * What a brand editor calls as the administrator types. Returns the reason *and* the
   * nearest shade that would pass, so they adjust their colour rather than being told no.
   */
  @RequirePermission(PERMISSIONS.CONFIG_WRITE)
  @Post('branding/validate')
  @HttpCode(200)
  validateBranding(@Body() body: UpdateDraftDto): readonly BrandingIssue[] {
    return this.branding.validate(body.branding ?? {});
  }

  /**
   * Save a partial edit to the draft.
   *
   * Branding is validated **before** it is stored, not on publish. Saving a palette that
   * cannot pass contrast and only discovering it at publish time means an administrator
   * fills in an entire setup flow before being told their first choice was wrong.
   */
  @RequirePermission(PERMISSIONS.CONFIG_WRITE)
  @Patch('draft')
  update(@Body() body: UpdateDraftDto): TenantConfig {
    if (body.branding) {
      const issues = this.branding.validate(body.branding);
      if (issues.length > 0) {
        // The reason already names the slot, so prefixing it again reads as
        // "primary: primary: …".
        throw new BadRequestException(
          issues.map((i) => `${i.reason}${i.suggestion ? ` Try ${i.suggestion}.` : ''}`).join(' '),
        );
      }
    }

    const updated = updateDraft(requirePrincipal().tenantId, body);
    if (!updated) {
      throw new NotFoundException('This organisation has no configuration yet.');
    }
    return updated;
  }

  /**
   * Take the draft live.
   *
   * The clinic's signal that setup is done. Deliberately explicit rather than automatic on
   * save — a portal that updated on every keystroke would show patients a half-finished
   * rebrand.
   */
  @RequirePermission(PERMISSIONS.CONFIG_WRITE)
  @Post('publish')
  @HttpCode(200)
  publish(): TenantConfig {
    const published = publishTenantConfig(requirePrincipal().tenantId);
    if (!published) {
      throw new NotFoundException('There is no draft to publish.');
    }
    return published;
  }
}
