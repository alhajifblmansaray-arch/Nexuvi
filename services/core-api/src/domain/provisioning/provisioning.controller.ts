import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import type {
  PlanDefinition,
  ProvisionTenantResult,
  SlugAvailability,
  TenantSummary,
  TenantTemplate,
} from '@nexuvi/api-contracts';

import { ProvisioningService } from './provisioning.service';
import { PLANS, TEMPLATES } from './templates';
import { ProvisionTenantDto } from './dto';
import { RequirePermission } from '../../infrastructure/identity/permission.guard';
import { PERMISSIONS } from '../../infrastructure/identity/permissions';
import { ActorService } from '../../infrastructure/identity/actor';
import { COUNTRY_CELLS } from '../../infrastructure/persistence/tenants';

/**
 * Platform provisioning API.
 *
 * Mounted under `/platform` and gated by platform capabilities that no tenant
 * administrator holds. Every route here acts across customers, which is precisely why
 * none of them can read a customer's clinical data.
 */
@Controller('platform')
export class ProvisioningController {
  constructor(
    private readonly provisioning: ProvisioningService,
    private readonly actors: ActorService,
  ) {}

  /** Templates an operator can choose from. */
  @RequirePermission(PERMISSIONS.PLATFORM_TENANT_READ)
  @Get('templates')
  templates(): readonly TenantTemplate[] {
    return Object.values(TEMPLATES);
  }

  @RequirePermission(PERMISSIONS.PLATFORM_TENANT_READ)
  @Get('plans')
  plans(): readonly PlanDefinition[] {
    return Object.values(PLANS);
  }

  /**
   * Country cells, with whether each is accepting new organisations.
   *
   * Surfaced because residency is the one provisioning decision that cannot be corrected
   * afterwards, so the operator should see the choice before making it.
   */
  @RequirePermission(PERMISSIONS.PLATFORM_TENANT_READ)
  @Get('country-cells')
  countryCells() {
    return COUNTRY_CELLS;
  }

  /**
   * Every clinic on the platform.
   *
   * Read-only and deliberately thin: names, addresses and status. A platform operator can
   * see that a customer exists; nothing here reaches inside one.
   */
  @RequirePermission(PERMISSIONS.PLATFORM_TENANT_READ)
  @Get('tenants')
  tenants(): readonly TenantSummary[] {
    return this.provisioning.listTenants();
  }

  /** Check a slug before committing to it — it ends up in patients' bookmarks. */
  @RequirePermission(PERMISSIONS.PLATFORM_TENANT_READ)
  @Get('slug-availability')
  slugAvailability(@Query('slug') slug?: string): SlugAvailability {
    return this.provisioning.checkSlug(slug ?? '');
  }

  /**
   * Create a tenant.
   *
   * `201`: this genuinely creates a resource. Not idempotent — a duplicate slug is a
   * conflict, never an overwrite.
   */
  @RequirePermission(PERMISSIONS.PLATFORM_TENANT_PROVISION)
  @Post('tenants')
  @HttpCode(201)
  provision(@Body() body: ProvisionTenantDto): ProvisionTenantResult {
    return this.provisioning.provision(body, this.actors.current());
  }
}
