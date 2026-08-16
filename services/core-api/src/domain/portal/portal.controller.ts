import { Body, Controller, ForbiddenException, Get, HttpCode, Post } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import type { PortalOverview, ResolvedPortalBrand } from '@nexuvi/api-contracts';

import { PortalService } from './portal.service';
import { BrandingService } from '../tenant-config/branding.service';
import { Public } from '../../infrastructure/identity/auth.guard';
import { PatientRoute } from '../../infrastructure/identity/permission.guard';
import { ConfigService } from '../../infrastructure/config/config.service';
import { TokenService } from '../../infrastructure/identity/token.service';
import { HostResolver } from '../../infrastructure/tenancy/host-resolver';
import { patientStore } from '../../infrastructure/persistence/patient-store';
import { currentContext, requirePatient } from '../../infrastructure/context/request-context';

export class PortalSignInRequest {
  @IsEmail({}, { message: 'Enter the email address your clinic has on file.' })
  email!: string;
}

/**
 * Patient portal API.
 *
 * Every route here is either `@Public()` (the clinic's own branding, which an anonymous
 * visitor must see to know they are in the right place) or `@PatientRoute()` (a patient
 * session, refusing staff tokens).
 *
 * The tenant comes from the **hostname** on public routes — there is no session yet, so it
 * is the only signal — and from the **token** on authenticated ones. They are never mixed:
 * hostname chooses branding, token chooses data.
 */
@Controller('portal')
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly branding: BrandingService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly hosts: HostResolver,
  ) {}

  /**
   * The clinic's branding and public profile, resolved from the hostname.
   *
   * Public because a patient must be able to see whose portal they have landed on before
   * signing in. It carries no patient data — clinic name, colours, hours, and which
   * sections the clinic switched on.
   */
  @Public()
  @Get('brand')
  brand(): ResolvedPortalBrand {
    return this.branding.resolve(this.requireHostTenant());
  }

  /**
   * Development sign-in.
   *
   * No credential is checked — there is no identity provider yet, and this says so rather
   * than implying a boundary it does not have. What it does establish is the shape: a
   * patient token is scoped to one tenant *and one record*, and is minted only for a
   * login that already exists at the clinic whose domain the request arrived on.
   *
   * An unknown email is refused with the same wording as a known one, so the endpoint is
   * not an oracle for which patients a clinic has.
   */
  @Public()
  @Post('sign-in')
  @HttpCode(200)
  signIn(@Body() body: PortalSignInRequest) {
    if (this.config.auth.mode !== 'dev' || this.config.isProduction) {
      throw new ForbiddenException('Patient sign-in is not available in this environment.');
    }

    const tenantId = this.requireHostTenant();
    const login = patientStore.findLogin(tenantId, body.email);
    if (!login) {
      throw new ForbiddenException('We could not sign you in. Check the address and try again.');
    }

    const patient = patientStore.findPatient(tenantId, login.patientId);

    const token = this.tokens.issueDevToken({
      sub: login.id,
      subject_type: 'patient',
      patient_id: login.patientId,
      email: login.email,
      name: patient ? `${patient.givenName} ${patient.familyName}` : login.email,
      tenant_id: tenantId,
      country_cell_id: 'cell_sl',
      // Deliberately no permissions and no facilities. A patient's authority is one fact,
      // not a capability grant.
    });

    return { token, expiresInSeconds: 3600 };
  }

  /** Everything the portal home needs, for the signed-in patient only. */
  @PatientRoute()
  @Get('overview')
  overview(): PortalOverview {
    const patient = requirePatient();
    return this.portal.getOverview(patient.tenantId, patient.patientId);
  }

  /**
   * The tenant implied by the hostname.
   *
   * Refused rather than defaulted. Guessing a clinic when the domain does not name one
   * would show a patient someone else's branding, and on a sign-in page that is a
   * phishing surface.
   */
  private requireHostTenant(): string {
    const tenantId = currentContext()?.hostTenantId;
    if (!tenantId) {
      throw new ForbiddenException(
        'This address is not a clinic portal. Use the link your clinic gave you.',
      );
    }
    return tenantId;
  }
}
