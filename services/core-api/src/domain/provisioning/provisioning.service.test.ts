import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AuditActor, ProvisionTenantRequest } from '@nexuvi/api-contracts';

import { ProvisioningService } from './provisioning.service';
import { AuditService } from '../audit/audit.service';
import { InviteService } from '../identity/invite.service';
import { ConfigService, loadConfig } from '../../infrastructure/config/config.service';
import { PLANS, TEMPLATES, resolveModules } from './templates';
import { findTenant, findTenantBySlug } from '../../infrastructure/persistence/tenants';
import { FACILITIES } from '../../infrastructure/persistence/roster-store';
import { tenantConfigStore, publishTenantConfig } from '../../infrastructure/persistence/tenant-config-store';
import { BrandingService } from '../tenant-config/branding.service';
import { HostResolver } from '../../infrastructure/tenancy/host-resolver';

const OPERATOR: AuditActor = {
  userId: 'usr_platform_01',
  displayName: 'Nexuvi Onboarding',
  role: 'platform-operator',
};

let audit: AuditService;
let provisioning: ProvisioningService;

/** Unique per call, so tests never collide on the registry they share. */
let counter = 0;
function request(overrides: Partial<ProvisionTenantRequest> = {}): ProvisionTenantRequest {
  counter += 1;
  return {
    legalName: `Test Clinic ${counter}`,
    slug: `test-clinic-${counter}-${Math.random().toString(36).slice(2, 8)}`,
    countryCellId: 'cell_sl',
    template: 'primary-care',
    plan: 'practice',
    adminEmail: 'admin@testclinic.sl',
    adminName: 'Test Admin',
    facilityName: 'Test Clinic Main',
    city: 'Freetown',
    timezone: 'Africa/Freetown',
    ...overrides,
  };
}

beforeEach(() => {
  audit = new AuditService();
  provisioning = new ProvisioningService(audit, new InviteService(audit), new ConfigService(loadConfig({})));
});

describe('ProvisioningService', () => {
  describe('creating a tenant', () => {
    it('creates a tenant, a facility, and a draft config', () => {
      const result = provisioning.provision(request(), OPERATOR);

      assert.ok(findTenant(result.tenantId), 'tenant should be in the registry');
      assert.ok(FACILITIES.some((f) => f.id === result.facilityId));

      // Draft, not published: a portal that goes live before anyone has checked it is a
      // portal patients find half-configured.
      assert.equal(tenantConfigStore.published(result.tenantId), undefined);
    });

    it('makes the new clinic resolvable exactly like a seeded one', () => {
      const result = provisioning.provision(request(), OPERATOR);
      const tenant = findTenantBySlug(result.slug);

      assert.equal(tenant?.id, result.tenantId);
      assert.equal(tenant?.status, 'active');
    });

    it('publishes only when the clinic says so', () => {
      const result = provisioning.provision(request(), OPERATOR);
      assert.equal(tenantConfigStore.published(result.tenantId), undefined);

      publishTenantConfig(result.tenantId);
      assert.ok(tenantConfigStore.published(result.tenantId));
    });

    it('audits the provisioning against the operator', () => {
      const result = provisioning.provision(request(), OPERATOR);
      const [entry] = audit.find(result.tenantId).items;

      assert.equal(entry?.action, 'tenant.provisioned');
      assert.equal(entry?.actor.userId, 'usr_platform_01');
      assert.equal(entry?.subject.type, 'tenant');
    });
  });

  describe('entitlements', () => {
    it('gives a tenant the intersection of template and plan', () => {
      // A hospital on essentials does not get wards because its template mentions them.
      const modules = resolveModules(TEMPLATES.hospital, PLANS.essentials);

      assert.ok(!modules.includes('wards'));
      assert.ok(!modules.includes('portal'));
      assert.ok(modules.includes('encounters'));
    });

    it('withholds a portal URL from a plan that has no portal', () => {
      // Handing over a URL for something they have not bought is a promise the product
      // will not keep.
      const result = provisioning.provision(request({ plan: 'essentials' }), OPERATOR);

      assert.equal(result.portalUrl, '');
      assert.ok(!result.seeded.modules.includes('portal'));
    });

    it('gives an enterprise hospital its full module set', () => {
      const result = provisioning.provision(
        request({ template: 'hospital', plan: 'enterprise' }),
        OPERATOR,
      );

      assert.ok(result.seeded.modules.includes('wards'));
      assert.ok(result.seeded.modules.includes('portal'));
      assert.ok(result.portalUrl.length > 0);
    });
  });

  describe('slugs', () => {
    it('refuses a slug already in use rather than overwriting', () => {
      // Silently replacing would repoint a live clinic's portal at another customer.
      const first = provisioning.provision(request(), OPERATOR);

      assert.throws(
        () => provisioning.provision(request({ slug: first.slug }), OPERATOR),
        ConflictException,
      );
    });

    it('refuses reserved platform names', () => {
      for (const reserved of ['admin', 'api', 'www', 'login', 'nexuvi']) {
        const check = provisioning.checkSlug(reserved);
        assert.equal(check.available, false, reserved);
        assert.match(check.reason ?? '', /reserved/);
      }
    });

    // `{slug}-app` is the staff hostname, so a slug ending in `-app` would give one tenant
    // a portal address that resolves to another tenant's administration screens.
    it('refuses slugs ending in the staff suffix', () => {
      const check = provisioning.checkSlug('wellness-app');
      assert.equal(check.available, false);
      assert.match(check.reason ?? '', /staff/i);
    });

    it('refuses malformed slugs', () => {
      for (const bad of ['ab', '-leading', 'trailing-', 'Has Capitals', 'has_underscore', 'a'.repeat(70)]) {
        assert.equal(provisioning.checkSlug(bad).available, false, bad);
      }
    });

    it('offers an alternative when a name is taken', () => {
      const first = provisioning.provision(request(), OPERATOR);
      const check = provisioning.checkSlug(first.slug);

      assert.equal(check.available, false);
      assert.ok(check.suggestion, 'a taken slug should suggest an alternative');
    });

    it('normalises case and whitespace before checking', () => {
      const check = provisioning.checkSlug('  Valid-Clinic-Name  ');
      assert.equal(check.slug, 'valid-clinic-name');
    });
  });

  describe('data residency', () => {
    it('refuses a cell that is not accepting tenants', () => {
      // Residency cannot be corrected later, so it must be right the first time.
      assert.throws(
        () => provisioning.provision(request({ countryCellId: 'cell_uk' }), OPERATOR),
        BadRequestException,
      );
    });

    it('refuses an unknown cell', () => {
      assert.throws(
        () => provisioning.provision(request({ countryCellId: 'cell_atlantis' }), OPERATOR),
        BadRequestException,
      );
    });

    it('records the cell on the tenant, since it cannot change', () => {
      const result = provisioning.provision(request({ countryCellId: 'cell_gh' }), OPERATOR);
      assert.equal(findTenant(result.tenantId)?.countryCellId, 'cell_gh');
    });
  });

  describe('the whole journey', () => {
    it('goes purchase → provision → publish → live branded portal', () => {
      const branding = new BrandingService();
      const hosts = new HostResolver(new ConfigService(loadConfig({})));

      // 1. Provisioned.
      const result = provisioning.provision(request({ legalName: 'Journey Clinic' }), OPERATOR);

      // 2. The hostname already routes — a clinic created at runtime is indistinguishable
      //    from a seeded one to every consumer.
      assert.equal(hosts.resolve(`${result.slug}.nexuvi.health`), result.tenantId);

      // 3. But the portal is not live. The draft is theirs to finish.
      assert.throws(() => branding.resolve(result.tenantId));

      // 4. The clinic publishes.
      publishTenantConfig(result.tenantId);

      // 5. Live, branded, with the platform's contrast-safe defaults because they have
      //    not chosen a colour yet.
      const brand = branding.resolve(result.tenantId);
      assert.equal(brand.profile.displayName, 'Journey Clinic');
      assert.equal(brand.themeKey, result.slug);
      assert.ok(brand.stylesheet.includes('--nx-color-action-primary'));

      // 6. The setup link carries a live invitation for the first administrator.
      assert.match(result.setupUrl, /\?invite=[A-Za-z0-9_-]{20,}/);
      assert.ok(new Date(result.inviteExpiresAt).getTime() > Date.now());

      // 7. And the seeded portal reflects their template.
      assert.deepEqual([...brand.portal.sections], [...TEMPLATES['primary-care'].portalSections]);
    });

    it('gives a new clinic a readable portal before they choose any colour', () => {
      // The platform palette is contrast-tested by construction, so "not configured yet"
      // never means "unreadable".
      const branding = new BrandingService();
      const result = provisioning.provision(request(), OPERATOR);
      publishTenantConfig(result.tenantId);

      assert.deepEqual(branding.validate({}), []);
      assert.ok(branding.resolve(result.tenantId).stylesheet.length > 0);
    });
  });

  describe('isolation of a brand new tenant', () => {
    it('starts with no data from anyone else', () => {
      const result = provisioning.provision(request(), OPERATOR);

      // Exactly one facility — its own. A new clinic seeing another's sites on day one
      // would be the worst possible first impression.
      const theirs = FACILITIES.filter((f) => f.tenantId === result.tenantId);
      assert.equal(theirs.length, 1);
      assert.equal(theirs[0]?.id, result.facilityId);

      assert.equal(audit.find(result.tenantId).total, 1);
    });
  });
});
