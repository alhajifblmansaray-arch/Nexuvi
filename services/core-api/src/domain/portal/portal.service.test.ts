import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';

import { PortalService } from './portal.service';
import { BrandingService } from '../tenant-config/branding.service';
import { HostResolver } from '../../infrastructure/tenancy/host-resolver';
import { ConfigService, loadConfig } from '../../infrastructure/config/config.service';
import { FREETOWN_GROUP, MAKENI_TRUST } from '../../infrastructure/persistence/tenants';

const portal = new PortalService();
const branding = new BrandingService();
const hosts = new HostResolver(new ConfigService(loadConfig({})));

/** The same human, registered separately at two clinics. */
const FREETOWN_PATIENT = 'pat_0001';
const MAKENI_PATIENT = 'pat_9001';

describe('PortalService', () => {
  describe('result release', () => {
    it('never returns a value for a result still under review', () => {
      // The rule that matters: a patient reading an abnormal result at 23:00 with no
      // clinician available is a known cause of avoidable harm.
      const overview = portal.getOverview(FREETOWN_GROUP, FREETOWN_PATIENT);

      for (const result of overview.results) {
        assert.notEqual(result.release, 'pending-review');
      }
    });

    it('strips the summary rather than filtering at the edge', () => {
      // `res_0003` has a summary in the store — "ALT 210 U/L". It must not appear anywhere
      // in the payload, not merely be absent from the list.
      const overview = portal.getOverview(FREETOWN_GROUP, FREETOWN_PATIENT);
      assert.ok(!JSON.stringify(overview).includes('ALT 210'));
    });

    it('counts withheld results without describing them', () => {
      const overview = portal.getOverview(FREETOWN_GROUP, FREETOWN_PATIENT);

      // The patient learns something is in progress — which is honest — without learning
      // what it says.
      assert.equal(overview.resultsAwaitingReview, 1);
    });

    it('returns the summary once a result is released', () => {
      const overview = portal.getOverview(FREETOWN_GROUP, FREETOWN_PATIENT);
      const released = overview.results.find((r) => r.release === 'released');

      assert.ok(released?.summary, 'a released result should carry its summary');
    });
  });

  describe('patient isolation', () => {
    it('refuses another tenant’s patient record', () => {
      assert.throws(
        () => portal.getOverview(FREETOWN_GROUP, MAKENI_PATIENT),
        NotFoundException,
      );
      assert.throws(
        () => portal.getOverview(MAKENI_TRUST, FREETOWN_PATIENT),
        NotFoundException,
      );
    });

    it('keeps the same person’s two registrations separate', () => {
      // pat_0001 and pat_9001 are one human at two clinics. Linking them would disclose
      // care received at one clinic to the other.
      const freetown = portal.getOverview(FREETOWN_GROUP, FREETOWN_PATIENT);
      const makeni = portal.getOverview(MAKENI_TRUST, MAKENI_PATIENT);

      assert.equal(freetown.patient.displayName, makeni.patient.displayName);
      assert.notEqual(freetown.patient.recordNumber, makeni.patient.recordNumber);

      const freetownResults = freetown.results.map((r) => r.id);
      const makeniResults = makeni.results.map((r) => r.id);
      assert.equal(freetownResults.filter((id) => makeniResults.includes(id)).length, 0);
    });

    it('refuses an unknown record with the same wording as a forbidden one', () => {
      // Distinguishing them tells a caller which patient ids are real.
      const forbidden = message(() => portal.getOverview(FREETOWN_GROUP, MAKENI_PATIENT));
      const missing = message(() => portal.getOverview(FREETOWN_GROUP, 'pat_nope'));
      assert.equal(forbidden, missing);
    });
  });

  describe('what a patient is shown', () => {
    it('surfaces allergies, because a gap the patient can correct is worth surfacing', () => {
      const overview = portal.getOverview(FREETOWN_GROUP, FREETOWN_PATIENT);
      assert.ok(overview.patient.allergies.length > 0);
    });

    it('does not leak triage severity or internal references', () => {
      // Operational facts about how the clinic ran that day are not clinical facts about
      // the patient, and showing them invites a reading nobody intended.
      const overview = portal.getOverview(FREETOWN_GROUP, FREETOWN_PATIENT);

      for (const visit of overview.recentVisits) {
        assert.ok(!('severity' in visit));
        assert.ok(!('waitingMinutes' in visit));
      }
    });
  });
});

describe('BrandingService', () => {
  it('emits a scoped stylesheet, not raw tenant colours', () => {
    const brand = branding.resolve(FREETOWN_GROUP);

    // The client never receives a colour string to interpolate — that is a CSS injection
    // vector. It receives finished, re-parsed declarations.
    assert.ok(brand.stylesheet.includes(`[data-tenant-theme="${brand.themeKey}"]`));
    assert.ok(brand.stylesheet.includes('--nx-color-action-primary'));
  });

  it('renders two clinics differently from the same code', () => {
    const clinic = branding.resolve(FREETOWN_GROUP);
    const hospital = branding.resolve(MAKENI_TRUST);

    assert.notEqual(clinic.themeKey, hospital.themeKey);
    assert.notEqual(clinic.stylesheet, hospital.stylesheet);
    assert.notEqual(clinic.profile.displayName, hospital.profile.displayName);
    assert.notDeepEqual(clinic.portal.sections, hospital.portal.sections);
  });

  it('never emits a locked clinical token from tenant input', () => {
    // §19.1: an allergy warning must look identical at every clinic on the platform.
    const clinic = branding.resolve(FREETOWN_GROUP);
    const hospital = branding.resolve(MAKENI_TRUST);

    const critical = (sheet: string) =>
      sheet.split('\n').filter((line) => line.includes('--nx-color-clinical-critical'));

    assert.deepEqual(critical(clinic.stylesheet), critical(hospital.stylesheet));
  });

  it('reports a failing brand colour with a workable suggestion', () => {
    // Pale yellow cannot carry white text. The clinic gets told why, and what would work.
    const issues = branding.validate({ primary: '#fff9c4' });

    assert.ok(issues.length > 0);
    assert.equal(issues[0]?.slot, 'primary');
    assert.ok(issues[0]?.reason.length > 0);
  });

  it('accepts a brand colour that passes', () => {
    assert.deepEqual(branding.validate({ primary: '#1f7a5a' }), []);
  });
});

describe('HostResolver', () => {
  it('maps a clinic staff subdomain to the same tenant', () => {
    // Same customer, different origin: patients at {slug}, staff at {slug}.app.
    assert.equal(hosts.resolve('freetown-family-group.app.nexuvi.health'), FREETOWN_GROUP);
    assert.equal(hosts.isStaffHost('freetown-family-group.app.nexuvi.health'), true);
    assert.equal(hosts.isStaffHost('freetown-family-group.nexuvi.health'), false);
  });

  it('maps a tenant subdomain to its tenant', () => {
    assert.equal(hosts.resolve('freetown-family-group.nexuvi.health'), FREETOWN_GROUP);
    assert.equal(hosts.resolve('makeni-regional.nexuvi.health'), MAKENI_TRUST);
  });

  it('ignores port and case', () => {
    assert.equal(hosts.resolve('Freetown-Family-Group.Nexuvi.Health:3000'), FREETOWN_GROUP);
  });

  it('does not resolve platform hosts to a tenant', () => {
    for (const host of ['localhost', 'nexuvi.health', 'app.nexuvi.health']) {
      assert.equal(hosts.resolve(host), undefined, host);
    }
  });

  it('refuses a lookalike domain', () => {
    // The attack this exists to stop: a suffix check that accepts anything ending in a
    // string that merely contains the platform domain.
    for (const host of [
      'freetown-family-group.nexuvi.health.evil.com',
      'evil.com/freetown-family-group.nexuvi.health',
      'a.freetown-family-group.nexuvi.health',
      'unknown-clinic.nexuvi.health',
    ]) {
      assert.equal(hosts.resolve(host), undefined, host);
    }
  });

  it('follows a configured platform domain, not a hardcoded one', () => {
    // The check that matters when the platform moves domain: nothing should need a code
    // change beyond PLATFORM_DOMAIN.
    const elsewhere = new HostResolver(
      new ConfigService(loadConfig({ PLATFORM_DOMAIN: 'nexuvi.app' })),
    );

    assert.equal(elsewhere.resolve('freetown-family-group.nexuvi.app'), FREETOWN_GROUP);
    assert.equal(elsewhere.isStaffHost('freetown-family-group.app.nexuvi.app'), true);
    assert.equal(elsewhere.resolve('app.nexuvi.app'), undefined);

    // And the old domain stops resolving, rather than both working.
    assert.equal(elsewhere.resolve('freetown-family-group.nexuvi.health'), undefined);
  });

  it('rejects a malformed host header rather than looking it up', () => {
    for (const host of ['', '   ', 'has spaces', 'x'.repeat(300)]) {
      assert.equal(hosts.resolve(host), undefined, JSON.stringify(host));
    }
  });
});

function message(fn: () => unknown): string {
  try {
    fn();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
