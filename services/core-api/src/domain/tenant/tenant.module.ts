import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantService } from './services/tenant.service';
import { TenantController } from './controllers/tenant.controller';
import { TenantEntity } from './entities/tenant.entity';
import { FacilityEntity } from './entities/facility.entity';

/**
 * Tenant module: organization, facility, and subscription management.
 *
 * Owned by: Tenant module
 * Private tables: tenants, facilities, departments, organizations
 * Exported: TenantService (for querying org/facility context)
 *
 * Cross-module dependencies: none at Phase 0; future modules will query
 * TenantService.getFacility() to get facility context for authorization.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TenantEntity, FacilityEntity])],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService], // Other modules can import and query this service
})
export class TenantModule {}
