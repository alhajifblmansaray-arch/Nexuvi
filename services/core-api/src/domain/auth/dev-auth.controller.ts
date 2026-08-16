import { Body, Controller, ForbiddenException, Headers, HttpCode, Post } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { Public } from '../../infrastructure/identity/auth.guard';
import { ConfigService } from '../../infrastructure/config/config.service';
import { TokenService } from '../../infrastructure/identity/token.service';
import { permissionsForRoles } from '../../infrastructure/identity/permissions';
import { FACILITIES } from '../../infrastructure/persistence/roster-store';
import { currentContext } from '../../infrastructure/context/request-context';
import { FREETOWN_GROUP, MAKENI_TRUST } from '../../infrastructure/persistence/tenants';

/**
 * Development personas, chosen so the authorization rules are demonstrable.
 *
 * `hospitalAdmin` belongs to a **different tenant**. It exists so cross-tenant isolation
 * can be exercised against the running API rather than only in unit tests: the same
 * endpoints, with a different token, must return an entirely different estate.
 */
const PERSONAS = {
  administrator: {
    sub: 'usr_admin_01',
    email: 'admin@freetownfamily.sl',
    name: 'Dr. Aminata Sesay',
    tenantId: FREETOWN_GROUP,
    roles: ['administrator'],
    /** Empty means organisation-wide — every facility in *this tenant*. */
    facilityIds: [] as string[],
  },
  hospitalAdmin: {
    sub: 'usr_admin_02',
    email: 'admin@makeniregional.sl',
    name: 'Dr. Ibrahim Kamara',
    tenantId: MAKENI_TRUST,
    roles: ['administrator'],
    facilityIds: [] as string[],
  },
  /**
   * Nexuvi staff, not a customer. Holds platform capabilities and no clinical ones —
   * the token that onboards a clinic cannot read inside one.
   */
  platformOperator: {
    sub: 'usr_platform_01',
    email: 'onboarding@nexuvi.health',
    name: 'Nexuvi Onboarding',
    tenantId: FREETOWN_GROUP,
    roles: ['platform-operator'],
    facilityIds: [] as string[],
  },
  physician: {
    sub: 'usr_101',
    email: 'sarah.conteh@freetownfamily.sl',
    name: 'Dr. Sarah Conteh',
    tenantId: FREETOWN_GROUP,
    roles: ['physician'],
    facilityIds: [FACILITIES[0]!.id],
  },
  nurse: {
    sub: 'usr_104',
    email: 'adama.kamara@freetownfamily.sl',
    name: 'Sister Adama Kamara',
    tenantId: FREETOWN_GROUP,
    roles: ['nurse'],
    facilityIds: [FACILITIES[0]!.id],
  },
} as const;

export type PersonaName = keyof typeof PERSONAS;

export class DevTokenRequest {
  @IsOptional()
  @IsString()
  @IsIn(Object.keys(PERSONAS))
  persona?: PersonaName;
}

/**
 * Issues a development access token.
 *
 * This exists because authentication is real now — every clinical route requires a bearer
 * token — while the identity provider is not yet provisioned. Without it the API would be
 * correct and unusable.
 *
 * Three protections keep it from becoming a production hole:
 *
 * 1. `TokenService.issueDevToken` throws unless `AUTH_MODE=dev`.
 * 2. Config refuses `AUTH_MODE=dev` when `NODE_ENV=production`, so the service will not
 *    boot in that combination.
 * 3. This handler checks again at request time, because defence that depends on a single
 *    check is defence that depends on nobody ever editing that check.
 *
 * The personas differ in capability and facility scope on purpose: `nurse` cannot assign
 * encounters and can see one site, `administrator` can do both. That is what makes the
 * authorization rules observable rather than theoretical.
 */
@Controller('auth')
export class DevAuthController {
  constructor(
    private readonly tokenService: TokenService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Localhost needs no secret; anything else does.
   *
   * This endpoint mints a **platform-operator** token — the authority to create customers.
   * On a laptop that is a convenience. The moment the API is reachable over a tunnel or a
   * staging URL it is an open door, and the difference between those two situations is
   * exactly "did this request arrive on localhost".
   *
   * `DEV_TOKEN_SECRET` is therefore mandatory for every non-local caller, and its absence
   * closes the endpoint rather than opening it.
   */
  private assertReachableFromHere(presented: string | undefined): void {
    const requestHost = currentContext()?.requestHost;
    const isLocal =
      requestHost === undefined ||
      requestHost.startsWith('localhost') ||
      requestHost.startsWith('127.0.0.1') ||
      requestHost.startsWith('[::1]');

    if (isLocal && !this.config.auth.devTokenSecret) return;

    const expected = this.config.auth.devTokenSecret;
    if (!expected) {
      throw new ForbiddenException(
        'This API is reachable from outside localhost, so development tokens are disabled. ' +
          'Set DEV_TOKEN_SECRET to re-enable them for callers that present it.',
      );
    }

    if (!presented || !constantTimeEquals(presented, expected)) {
      throw new ForbiddenException('Development tokens require a valid x-nexuvi-dev-secret.');
    }
  }

  @Public()
  @Post('dev-token')
  @HttpCode(200)
  issue(
    @Body() body: DevTokenRequest,
    @Headers('x-nexuvi-dev-secret') presented?: string,
  ) {
    if (this.config.auth.mode !== 'dev' || this.config.isProduction) {
      throw new ForbiddenException('Development tokens are not available in this environment.');
    }

    this.assertReachableFromHere(presented);

    const persona = PERSONAS[body.persona ?? 'administrator'];
    const permissions = permissionsForRoles(persona.roles);

    const token = this.tokenService.issueDevToken({
      sub: persona.sub,
      email: persona.email,
      name: persona.name,
      tenant_id: persona.tenantId,
      country_cell_id: 'cell_sl',
      roles: [...persona.roles],
      permissions: [...permissions],
      facility_ids: [...persona.facilityIds],
    });

    return {
      token,
      expiresInSeconds: 3600,
      persona: body.persona ?? 'administrator',
      grants: { roles: persona.roles, permissions, facilityIds: persona.facilityIds },
    };
  }
}

/** Constant-time comparison, so the secret cannot be walked a byte at a time. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
