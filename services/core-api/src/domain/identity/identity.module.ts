import { Module } from '@nestjs/common';

import { IdentityController } from './identity.controller';
import { InviteService } from './invite.service';
import { AuthenticationService } from './authentication.service';
import { BrandingService } from '../tenant-config/branding.service';

/**
 * Staff identity: invitations, local credentials, sign-in.
 *
 * Owned by: Identity
 * Private tables: staff_users, tenant_invites
 * Exported: InviteService — provisioning issues the first administrator's invitation.
 */
@Module({
  controllers: [IdentityController],
  providers: [InviteService, AuthenticationService, BrandingService],
  exports: [InviteService],
})
export class IdentityModule {}
