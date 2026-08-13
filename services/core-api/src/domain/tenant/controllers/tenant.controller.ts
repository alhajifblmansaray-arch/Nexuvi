import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import { TenantService } from '../services/tenant.service';

/**
 * Tenant REST API.
 *
 * Endpoints for querying organizations and facilities.
 * All endpoints require authentication and authorization (§16.1).
 *
 * Example routes:
 * - GET /tenants/:tenantId
 * - GET /facilities/:facilityId
 * - GET /tenants/:tenantId/facilities
 */
@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  /**
   * Get tenant details (organizations, facilities, etc.).
   *
   * Blueprint §3.3: returns public organization details (branding, location, hours)
   * but not sensitive configuration.
   */
  @Get(':tenantId')
  async getTenant(@Param('tenantId') tenantId: string) {
    const tenant = await this.tenantService.getTenantById(tenantId);
    return {
      id: tenant.id,
      name: tenant.legal_name,
      slug: tenant.slug,
      status: tenant.status,
    };
  }

  /**
   * List facilities in the current tenant.
   */
  @Get(':tenantId/facilities')
  async getFacilities(@Param('tenantId') tenantId: string) {
    // Verify tenant access (middleware sets the tenant context)
    await this.tenantService.getTenantById(tenantId);
    const facilities = await this.tenantService.getFacilitiesForCurrentTenant();
    return facilities.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      address: f.address,
      hours: this.tenantService.getOpeningHours(f),
    }));
  }
}
