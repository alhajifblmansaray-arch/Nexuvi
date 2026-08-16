import { Module } from '@nestjs/common';

import { ProvisioningController } from './provisioning.controller';
import { ProvisioningService } from './provisioning.service';
import { IdentityModule } from '../identity/identity.module';

/**
 * Provisioning: creating and configuring customers.
 *
 * Owned by: Platform
 * Private tables: tenants, country_cells, tenant_configs
 * Exported: nothing — no domain module should be creating tenants.
 */
@Module({
  // Provisioning issues the first administrator's invitation, so it needs the identity
  // module's exported service. Nest requires the import even though the service is
  // exported — an export makes a provider *available*, it does not inject it.
  imports: [IdentityModule],
  controllers: [ProvisioningController],
  providers: [ProvisioningService],
})
export class ProvisioningModule {}
