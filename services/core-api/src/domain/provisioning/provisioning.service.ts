import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AuditActor,
  ProvisionTenantRequest,
  ProvisionTenantResult,
  SlugAvailability,
  TenantSummary,
} from '@nexuvi/api-contracts';

import { PLANS, TEMPLATES, resolveModules } from './templates';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '../../infrastructure/config/config.service';
import { InviteService } from '../identity/invite.service';
import {
  TENANTS,
  findCountryCell,
  findTenantBySlug,
  registerTenant,
} from '../../infrastructure/persistence/tenants';
import { registerFacility } from '../../infrastructure/persistence/roster-store';
import { seedTenantConfig } from '../../infrastructure/persistence/tenant-config-store';

/**
 * Slugs the platform keeps for itself.
 *
 * A clinic that took `app` or `admin` would own a hostname the platform routes to its own
 * surfaces, which is a phishing surface pointed at our own staff.
 */
const RESERVED_SLUGS = new Set([
  'app', 'admin', 'api', 'www', 'mail', 'status', 'support', 'help', 'docs',
  'billing', 'account', 'accounts', 'login', 'signin', 'auth', 'portal',
  'platform', 'nexuvi', 'internal', 'staging', 'test', 'demo',
]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,60}[a-z0-9])$/;

/**
 * Creates a tenant: what happens when a clinic buys Nexuvi.
 *
 * Three properties this is built around:
 *
 * **It is audited.** Provisioning creates a paying customer, and a bug here creates or
 * modifies one. The audit entry is written in the same operation as the creation.
 *
 * **It validates the irreversible decisions hardest.** The country cell and the slug
 * cannot be corrected with an UPDATE later — one is a physical migration, the other is in
 * patients' bookmarks and printed material. Everything else a clinic can change themselves.
 *
 * **It is not idempotent, and says so.** A duplicate slug is a conflict, never an
 * overwrite: silently replacing a tenant would repoint a live clinic's portal at a
 * different customer's configuration.
 */
@Injectable()
export class ProvisioningService {
  constructor(
    private readonly audit: AuditService,
    private readonly invites: InviteService,
    private readonly config: ConfigService,
  ) {}

  /** The domain clinic subdomains hang off. */
  private get domain(): string {
    return this.config.config.platformDomain;
  }

  /** Where a clinic's patients go. */
  portalUrlFor(slug: string): string {
    return `https://${slug}.${this.domain}`;
  }

  /**
   * Where a clinic's staff sign in.
   *
   * One definition, because this rule already changed once — staff moved from
   * `{slug}.app` to `{slug}-app` so a wildcard certificate could cover it — and a second
   * copy anywhere is the one that will be missed next time.
   */
  staffUrlFor(slug: string): string {
    return `https://${slug}-app.${this.domain}`;
  }

  /**
   * Every clinic on the platform, for the operator console.
   *
   * Registry order, which is provisioning order. No clinical data crosses this boundary —
   * a platform operator can see that a customer exists, never what is inside it.
   */
  listTenants(): readonly TenantSummary[] {
    return TENANTS.map((t) => ({
      tenantId: t.id,
      slug: t.slug,
      legalName: t.legalName,
      countryCellId: t.countryCellId,
      status: t.status ?? 'active',
      staffUrl: this.staffUrlFor(t.slug),
      // The portal is a plan entitlement. Listing an address for a clinic that has not
      // bought one sends the operator to a surface their customer does not have.
      ...(t.modules?.includes('portal') === false ? {} : { portalUrl: this.portalUrlFor(t.slug) }),
      // Spread rather than assigned: the seeded fixture tenants predate plans and
      // templates, and `exactOptionalPropertyTypes` distinguishes an absent field from one
      // present and undefined. Absent is the honest answer.
      ...(t.plan ? { plan: t.plan as NonNullable<TenantSummary['plan']> } : {}),
      ...(t.template ? { template: t.template as NonNullable<TenantSummary['template']> } : {}),
      ...(t.createdAt ? { createdAt: t.createdAt } : {}),
    }));
  }

  checkSlug(slug: string): SlugAvailability {
    const normalised = slug.trim().toLowerCase();

    if (!SLUG_PATTERN.test(normalised)) {
      return {
        slug: normalised,
        available: false,
        reason:
          'Use 3–62 characters: lowercase letters, numbers and hyphens, not starting or ending with a hyphen.',
      };
    }
    if (RESERVED_SLUGS.has(normalised)) {
      return { slug: normalised, available: false, reason: 'This name is reserved by the platform.' };
    }
    // `{slug}-app` is the staff surface. A tenant holding a slug that ends in `-app` would
    // own a portal hostname that routes to another tenant's administration screens.
    if (normalised.endsWith('-app')) {
      return {
        slug: normalised,
        available: false,
        reason: 'Names ending in “-app” are reserved for staff sign-in.',
        suggestion: `${normalised.slice(0, -'-app'.length)}-clinic`,
      };
    }
    if (findTenantBySlug(normalised)) {
      return {
        slug: normalised,
        available: false,
        reason: 'Another organisation is already using this name.',
        suggestion: `${normalised}-clinic`,
      };
    }

    return { slug: normalised, available: true };
  }

  provision(request: ProvisionTenantRequest, actor: AuditActor): ProvisionTenantResult {
    const slug = this.requireSlug(request.slug);
    const cell = this.requireCountryCell(request.countryCellId);

    const template = TEMPLATES[request.template];
    const plan = PLANS[request.plan];
    if (!template) throw new BadRequestException(`Unknown template "${request.template}".`);
    if (!plan) throw new BadRequestException(`Unknown plan "${request.plan}".`);

    if (!request.legalName?.trim()) {
      throw new BadRequestException('A legal name is required.');
    }
    if (!request.adminEmail?.includes('@')) {
      throw new BadRequestException('A valid administrator email is required.');
    }

    const modules = resolveModules(template, plan);

    // Portal is a plan entitlement. Provisioning a clinic whose plan excludes it and then
    // handing them a portal URL would promise something they have not bought.
    const portalIncluded = modules.includes('portal');

    const tenantId = `ten_${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
    const facilityId = `fac_${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
    const provisionedAt = new Date().toISOString();

    const tenant = registerTenant({
      id: tenantId,
      slug,
      legalName: request.legalName.trim(),
      countryCellId: cell.id,
      kind: request.template === 'hospital' ? 'hospital' : 'clinic-group',
      plan: plan.key,
      template: template.key,
      modules,
      status: 'active',
      createdAt: provisionedAt,
    });

    registerFacility({
      id: facilityId,
      tenantId,
      name: request.facilityName.trim() || request.legalName.trim(),
      slug: `${slug}-main`,
      city: request.city.trim(),
      timezone: request.timezone,
      open: true,
    });

    // A draft, not a published config. The clinic publishes when their setup is done —
    // a portal that goes live before anyone has checked it is a portal patients see
    // half-configured.
    seedTenantConfig({
      tenantId,
      template,
      displayName: request.legalName.trim(),
      city: request.city.trim(),
      portalHost: `${slug}.${this.domain}`,
      portalIncluded,
    });

    // The bootstrap. A tenant with no users has nobody who can create one, so the first
    // administrator's invitation is issued as part of provisioning rather than as a
    // separate step someone can forget.
    const invitation = this.invites.invite({
      tenantId,
      email: request.adminEmail,
      displayName: request.adminName,
      roles: ['administrator'],
      invitedByName: actor.displayName,
    });

    this.audit.append({
      tenantId,
      action: 'tenant.provisioned',
      actor,
      subject: { type: 'tenant', id: tenantId, reference: slug },
      facilityId,
      changes: [
        { field: 'plan', from: null, to: plan.key },
        { field: 'template', from: null, to: template.key },
        { field: 'countryCellId', from: null, to: cell.id },
        { field: 'adminEmail', from: null, to: request.adminEmail },
      ],
      source: 'api',
    });

    return {
      tenantId: tenant.id,
      slug,
      facilityId,
      portalUrl: portalIncluded ? this.portalUrlFor(slug) : '',
      // Carries the invitation token. It is shown to the operator once, for delivery —
      // nothing stores the plaintext, so it cannot be retrieved later.
      // The staff subdomain, not the patient portal. Administration and patient-facing
      // surfaces are deliberately different origins.
      setupUrl: `${this.staffUrlFor(slug)}/setup?invite=${invitation.token}`,
      inviteExpiresAt: invitation.expiresAt,
      plan: plan.key,
      template: template.key,
      seeded: {
        departments: template.departments.length,
        appointmentTypes: template.appointmentTypes.length,
        roles: template.roles.length,
        modules,
      },
      provisionedAt,
    };
  }

  // ---------------------------------------------------------------------------

  private requireSlug(slug: string): string {
    const check = this.checkSlug(slug ?? '');
    if (check.available) return check.slug;

    // A taken name is a conflict; a malformed one is a bad request. The distinction
    // matters to the caller — one is retryable with a different value, the other is a
    // programming error.
    if (check.reason?.includes('already using')) {
      throw new ConflictException(check.reason);
    }
    throw new BadRequestException(check.reason ?? 'Invalid slug.');
  }

  private requireCountryCell(id: string) {
    const cell = findCountryCell(id);
    if (!cell) {
      throw new BadRequestException(`Unknown country cell "${id}".`);
    }
    if (!cell.acceptingTenants) {
      // Provisioning into a cell that is not ready would place a customer's data somewhere
      // that cannot yet serve it, and residency cannot be corrected later.
      throw new BadRequestException(
        `${cell.label} is not accepting new organisations yet. Data residency cannot be changed after provisioning, so this must be right the first time.`,
      );
    }
    return cell;
  }
}
