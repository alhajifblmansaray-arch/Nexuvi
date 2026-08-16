import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Query } from '@nestjs/common';

import { AcceptInviteDto, InviteColleagueDto, SignInDto } from './dto';
import { InviteService, type InvitePreview } from './invite.service';
import { AuthenticationService } from './authentication.service';
import { Public } from '../../infrastructure/identity/auth.guard';
import { RequirePermission } from '../../infrastructure/identity/permission.guard';
import { PERMISSIONS } from '../../infrastructure/identity/permissions';
import { requirePrincipal } from '../../infrastructure/context/request-context';
import { TokenService } from '../../infrastructure/identity/token.service';
import { HostResolver } from '../../infrastructure/tenancy/host-resolver';
import { permissionsForRoles } from '../../infrastructure/identity/permissions';
import { currentContext } from '../../infrastructure/context/request-context';
import { findTenant } from '../../infrastructure/persistence/tenants';
import { identityStore } from '../../infrastructure/persistence/identity-store';
import { BrandingService } from '../tenant-config/branding.service';

/**
 * Staff identity: accepting an invitation, and signing in.
 *
 * All public — these are the routes a person uses *before* they have a session. They are
 * therefore the routes most exposed to guessing, which is why the invitation token is
 * high-entropy and single-use and sign-in locks out.
 */
@Controller('identity')
export class IdentityController {
  constructor(
    private readonly invites: InviteService,
    private readonly authentication: AuthenticationService,
    private readonly tokens: TokenService,
    private readonly hosts: HostResolver,
    private readonly branding: BrandingService,
  ) {}

  /**
   * The clinic a staff member is signing in to.
   *
   * Public, and carries no patient data — the clinic's name, colours, and contact details.
   * It exists so the sign-in screen can show *whose* system this is before anyone types a
   * password: an unbranded login box is indistinguishable from a phishing page, and a
   * clinician who works at two customers needs to see which one they are entering.
   *
   * Falls back to the draft, because staff must be able to sign in before the clinic has
   * published anything.
   */
  @Public()
  @Get('clinic')
  clinic() {
    const brand = this.branding.resolveForStaff(this.requireHostTenant());
    return {
      displayName: brand.profile.displayName,
      tagline: brand.profile.tagline ?? null,
      phone: brand.profile.phone ?? null,
      themeKey: brand.themeKey,
      stylesheet: brand.stylesheet,
      logoUrl: brand.logoUrl,
      typeface: brand.typeface,
    };
  }

  /** What the invitee sees before committing: which clinic, which role, who invited them. */
  @Public()
  @Get('invite')
  preview(@Query('token') token?: string): InvitePreview {
    return this.invites.preview(token ?? '');
  }

  /**
   * Accept an invitation and set a password.
   *
   * Returns a session immediately. Making someone sign in again with credentials they set
   * ten seconds ago adds a step and no security — they have already proved they hold the
   * invitation.
   */
  @Public()
  @Post('invite/accept')
  @HttpCode(201)
  async accept(@Body() body: AcceptInviteDto) {
    const user = await this.invites.accept(body.token, body.password);
    return this.session(user.tenantId, user.id, user.email, user.displayName, user.roles);
  }

  /**
   * Everyone at this clinic: accounts, and invitations not yet taken up.
   *
   * Pending invitations are listed **without their tokens** — the plaintext was shown once
   * at issue and is not recoverable. Re-displaying it would make a database read equivalent
   * to holding the credential.
   */
  @RequirePermission(PERMISSIONS.ROLE_ASSIGN)
  @Get('team')
  team() {
    const { tenantId } = requirePrincipal();

    return {
      members: identityStore.listUsers(tenantId).map((user) => ({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        roles: user.roles,
        status: user.status,
        createdAt: user.createdAt,
      })),
      pending: identityStore
        .listInvites(tenantId)
        .filter((invite) => !invite.acceptedAt)
        .filter((invite) => new Date(invite.expiresAt).getTime() > Date.now())
        .map((invite) => ({
          email: invite.email,
          displayName: invite.displayName,
          roles: invite.roles,
          expiresAt: invite.expiresAt,
          invitedByName: invite.invitedByName,
        })),
    };
  }

  /**
   * Invite a colleague into your own clinic.
   *
   * Tenant-scoped: the tenant comes from the session, so an administrator can only ever
   * invite someone into their *own* organisation. Gated on `role:assign`, because handing
   * out clinical access is the same kind of act as granting a capability.
   *
   * Returns the token for delivery. Nothing stores the plaintext, so it cannot be shown
   * again — that is deliberate, not a limitation.
   */
  @RequirePermission(PERMISSIONS.ROLE_ASSIGN)
  @Post('invitations')
  @HttpCode(201)
  inviteColleague(@Body() body: InviteColleagueDto) {
    const principal = requirePrincipal();
    const { token, expiresAt } = this.invites.invite({
      tenantId: principal.tenantId,
      email: body.email,
      displayName: body.displayName,
      roles: body.roles,
      invitedByName: principal.displayName,
    });

    return { token, expiresAt };
  }

  /**
   * Sign in.
   *
   * The tenant comes from the hostname, not the request body. A body-supplied tenant would
   * let a caller aim credentials at any clinic on the platform (§17.3), and it would make
   * the lockout trivially bypassable by varying the tenant.
   */
  @Public()
  @Post('sign-in')
  @HttpCode(200)
  async signIn(@Body() body: SignInDto) {
    const tenantId = this.requireHostTenant();
    const user = await this.authentication.signIn(tenantId, body.email, body.password);
    return this.session(user.tenantId, user.id, user.email, user.displayName, user.roles);
  }

  // ---------------------------------------------------------------------------

  private session(
    tenantId: string,
    userId: string,
    email: string,
    displayName: string,
    roles: readonly string[],
  ) {
    const tenant = findTenant(tenantId);

    const token = this.tokens.issueDevToken({
      sub: userId,
      subject_type: 'staff',
      email,
      name: displayName,
      tenant_id: tenantId,
      country_cell_id: tenant?.countryCellId ?? '',
      roles: [...roles],
      // Capabilities are resolved from roles server-side. A token that carried whatever
      // permissions the client asked for would not be a capability check at all.
      permissions: [...permissionsForRoles(roles)],
      facility_ids: [],
    });

    return {
      token,
      expiresInSeconds: 3600,
      user: { id: userId, email, displayName, roles },
    };
  }

  private requireHostTenant(): string {
    const tenantId = currentContext()?.hostTenantId;
    if (!tenantId) {
      throw new ForbiddenException(
        'Sign in from your clinic’s own address. Use the link your clinic gave you.',
      );
    }
    return tenantId;
  }
}
