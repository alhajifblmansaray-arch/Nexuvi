import { Module } from '@nestjs/common';

import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { BrandingService } from '../tenant-config/branding.service';
import { TenantConfigController } from '../tenant-config/tenant-config.controller';

/**
 * Patient portal: the white-label surface a clinic hands to its patients.
 *
 * Owned by: Portal module
 * Private tables: patient_logins
 * Reads through: PortalService only — the portal never touches another module's tables.
 */
@Module({
  controllers: [PortalController, TenantConfigController],
  providers: [PortalService, BrandingService],
  exports: [BrandingService],
})
export class PortalModule {}
