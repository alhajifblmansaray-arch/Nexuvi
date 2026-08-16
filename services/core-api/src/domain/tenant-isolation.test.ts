import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import type { AuditActor } from '@nexuvi/api-contracts';

import { AuditService } from './audit/audit.service';
import { DashboardService } from './dashboard/dashboard.service';
import { EncounterService } from './encounter/encounter.service';
import { ScheduleService } from './schedule/schedule.service';
import { FREETOWN_GROUP, MAKENI_TRUST } from '../infrastructure/persistence/tenants';

/**
 * Cross-tenant isolation (§17.3).
 *
 * These are the **negative** tests the blueprint asks for: not "tenant A can read its own
 * data" — which passes by accident in any single-tenant fixture — but "tenant A cannot
 * read tenant B's", which only passes if a filter is actually present.
 *
 * They are deliberately written per read path rather than as one generic check. A missing
 * tenant filter is not a systemic bug that appears everywhere at once; it is a single
 * forgotten `.filter()` on one query, and a test that only exercises one path would miss
 * it on the other five.
 *
 * This is application-layer isolation. RLS (`database/migrations/0002_row_level_security.sql`)
 * is the second layer, and needs a live database to test.
 */

const ACTOR: AuditActor = { userId: 'usr_t', displayName: 'Tester', role: 'Administrator' };

/** Known fixture references, one per tenant. */
const FREETOWN_ENCOUNTER = 'ENC-10847';
const MAKENI_ENCOUNTER = 'MKN-20315';

let audit: AuditService;
let encounters: EncounterService;
let dashboard: DashboardService;
let schedule: ScheduleService;

beforeEach(() => {
  audit = new AuditService();
  encounters = new EncounterService(audit);
  dashboard = new DashboardService();
  schedule = new ScheduleService();
});

describe('cross-tenant isolation', () => {
  describe('the fixture itself', () => {
    it('has data in both tenants, or these tests prove nothing', () => {
      assert.ok(encounters.find(FREETOWN_GROUP, {}).total > 0);
      assert.ok(encounters.find(MAKENI_TRUST, {}).total > 0);
      assert.ok(schedule.listFacilities(FREETOWN_GROUP).length > 0);
      assert.ok(schedule.listFacilities(MAKENI_TRUST).length > 0);
    });
  });

  describe('encounters', () => {
    it('never returns another tenant’s encounters in a list', () => {
      const freetown = encounters.find(FREETOWN_GROUP, { pageSize: 100 }).items;
      const makeni = encounters.find(MAKENI_TRUST, { pageSize: 100 }).items;

      const makeniRefs = new Set(makeni.map((e) => e.reference));
      for (const encounter of freetown) {
        assert.ok(!makeniRefs.has(encounter.reference), `${encounter.reference} leaked`);
      }
      assert.ok(freetown.every((e) => e.reference.startsWith('ENC-')));
      assert.ok(makeni.every((e) => e.reference.startsWith('MKN-')));
    });

    it('cannot fetch another tenant’s encounter by reference', () => {
      // The reference is real and resolvable — just not for this caller.
      assert.throws(
        () => encounters.findByReference(FREETOWN_GROUP, MAKENI_ENCOUNTER),
        NotFoundException,
      );
      assert.throws(
        () => encounters.findByReference(MAKENI_TRUST, FREETOWN_ENCOUNTER),
        NotFoundException,
      );
    });

    it('does not surface another tenant’s encounter through search', () => {
      // Search is the path most likely to forget a scope: the natural implementation
      // matches a name against every row.
      const hit = encounters.find(FREETOWN_GROUP, { search: 'Isatu Kargbo', pageSize: 100 });
      assert.equal(hit.total, 0);
    });

    it('does not leak another tenant’s departments', () => {
      const freetown = encounters.listDepartments(FREETOWN_GROUP);
      const makeni = encounters.listDepartments(MAKENI_TRUST);

      assert.ok(makeni.includes('Maternity'));
      assert.ok(!freetown.includes('Maternity'));
      assert.equal(freetown.filter((d) => makeni.includes(d)).length, 0);
    });

    it('does not leak another tenant’s clinicians', () => {
      const freetown = encounters.listClinicians(FREETOWN_GROUP).map((c) => c.id);
      const makeni = encounters.listClinicians(MAKENI_TRUST).map((c) => c.id);

      assert.ok(freetown.length > 0 && makeni.length > 0);
      assert.equal(freetown.filter((id) => makeni.includes(id)).length, 0);
    });
  });

  describe('writes', () => {
    it('refuses to assign another tenant’s encounter', () => {
      assert.throws(
        () => encounters.assign(MAKENI_TRUST, FREETOWN_ENCOUNTER, 'usr_201', ACTOR),
        NotFoundException,
      );
    });

    it('refuses to assign a clinician from another tenant', () => {
      // Both ids are real; the pairing is not. This is the subtler failure — the encounter
      // resolves, so a check on the encounter alone would let it through.
      assert.throws(
        () => encounters.assign(FREETOWN_GROUP, FREETOWN_ENCOUNTER, 'usr_201', ACTOR),
        NotFoundException,
      );
    });

    it('records the writing tenant on the audit event', () => {
      encounters.assign(FREETOWN_GROUP, FREETOWN_ENCOUNTER, 'usr_102', ACTOR);
      // Newest first, so index 0 is this test's entry.
      const [entry] = audit.find(FREETOWN_GROUP).items;
      assert.equal(entry?.tenantId, FREETOWN_GROUP);

      // Restore, so this suite does not depend on execution order.
      encounters.assign(FREETOWN_GROUP, FREETOWN_ENCOUNTER, null, ACTOR, 'test teardown');
    });
  });

  describe('audit log', () => {
    /**
     * Unique tenants per assertion. The log is shared, persisted module state, so a test
     * that counted entries in a fixture tenant would be counting other tests' work too.
     */
    let seq = 0;
    const freshTenant = () => `ten_audit_${(seq += 1)}_${Math.random().toString(36).slice(2, 8)}`;

    it('never returns another tenant’s events', () => {
      // The most damaging cross-tenant read in the product: the log names patients,
      // clinicians, and what was done to whom.
      const a = freshTenant();
      const b = freshTenant();

      audit.append({
        tenantId: a,
        action: 'encounter.assigned',
        actor: ACTOR,
        subject: { type: 'encounter', id: 'enc_0001', reference: 'ENC-10847' },
        facilityId: 'fac_a',
        changes: [],
      });
      audit.append({
        tenantId: b,
        action: 'encounter.assigned',
        actor: ACTOR,
        subject: { type: 'encounter', id: 'enc_9001', reference: 'MKN-20315' },
        facilityId: 'fac_b',
        changes: [],
      });

      const first = audit.find(a);
      assert.equal(first.total, 1);
      assert.equal(first.items[0]?.subject.reference, 'ENC-10847');

      const second = audit.find(b);
      assert.equal(second.total, 1);
      assert.equal(second.items[0]?.subject.reference, 'MKN-20315');
    });

    it('does not let a subject id from another tenant bypass the filter', () => {
      audit.append({
        tenantId: freshTenant(),
        action: 'encounter.assigned',
        actor: ACTOR,
        subject: { type: 'encounter', id: 'enc_9001', reference: 'MKN-20315' },
        facilityId: 'fac_b',
        changes: [],
      });

      // Knowing the id must not be enough — that is exactly the guessed-identifier attack.
      const other = freshTenant();
      assert.equal(audit.find(other, { subjectId: 'enc_9001' }).total, 0);
      assert.equal(audit.findForSubject(other, 'enc_9001').length, 0);
    });

    it('does not let a shared actor id bypass the filter', () => {
      // A support agent or a platform operator can act in more than one tenant.
      const mine = freshTenant();
      const theirs = freshTenant();

      audit.append({
        tenantId: theirs,
        action: 'encounter.assigned',
        actor: ACTOR,
        subject: { type: 'encounter', id: 'enc_9001', reference: 'MKN-20315' },
        facilityId: 'fac_b',
        changes: [],
      });

      assert.equal(audit.find(mine, { actorId: ACTOR.userId }).total, 0);
      assert.equal(audit.find(theirs, { actorId: ACTOR.userId }).total, 1);
    });
  });

  describe('dashboard', () => {
    it('counts only the caller’s tenant', () => {
      const freetown = dashboard.getOperationsDashboard(FREETOWN_GROUP);
      const makeni = dashboard.getOperationsDashboard(MAKENI_TRUST);

      assert.notEqual(freetown.facility.id, makeni.facility.id);

      const freetownRefs = new Set(freetown.needsAttention.map((i) => i.reference));
      for (const item of makeni.needsAttention) {
        assert.ok(!freetownRefs.has(item.reference), `${item.reference} leaked`);
      }
    });

    it('does not include another tenant’s clinicians in the roster panel', () => {
      const freetown = dashboard.getOperationsDashboard(FREETOWN_GROUP).clinicians.map((c) => c.id);
      const makeni = dashboard.getOperationsDashboard(MAKENI_TRUST).clinicians.map((c) => c.id);

      assert.equal(freetown.filter((id) => makeni.includes(id)).length, 0);
    });
  });

  describe('schedule', () => {
    it('lists only the caller’s facilities', () => {
      const freetown = schedule.listFacilities(FREETOWN_GROUP).map((f) => f.slug);
      const makeni = schedule.listFacilities(MAKENI_TRUST).map((f) => f.slug);

      assert.ok(freetown.includes('freetown-family'));
      assert.ok(makeni.includes('makeni-regional-hospital'));
      assert.equal(freetown.filter((s) => makeni.includes(s)).length, 0);
    });

    it('refuses another tenant’s facility by id', () => {
      const makeniFacility = schedule.listFacilities(MAKENI_TRUST)[0]!;
      assert.throws(
        () => schedule.getDaySchedule(FREETOWN_GROUP, makeniFacility.id, '2026-08-10'),
        NotFoundException,
      );
    });

    it('refuses another tenant’s facility by slug', () => {
      // Slugs are guessable in a way ids are not, so this is the likelier probe.
      assert.throws(
        () => schedule.getDaySchedule(FREETOWN_GROUP, 'makeni-regional-hospital', '2026-08-10'),
        NotFoundException,
      );
    });

    it('never puts another tenant’s clinicians in a grid', () => {
      const makeniIds = new Set(
        schedule
          .listFacilities(MAKENI_TRUST)
          .flatMap((f) => schedule.getDaySchedule(MAKENI_TRUST, f.id, '2026-08-10').columns)
          .map((c) => c.clinicianId),
      );

      for (const facility of schedule.listFacilities(FREETOWN_GROUP)) {
        const day = schedule.getDaySchedule(FREETOWN_GROUP, facility.id, '2026-08-10');
        for (const column of day.columns) {
          assert.ok(!makeniIds.has(column.clinicianId), `${column.clinicianName} leaked`);
        }
      }
    });

    it('does not expose the internal tenant key on the wire', () => {
      const facility = schedule.listFacilities(FREETOWN_GROUP)[0]!;
      assert.ok(!('tenantId' in facility), 'tenantId must be stripped before the wire');
    });
  });

  describe('an unknown tenant', () => {
    it('reads nothing rather than everything', () => {
      // The failure mode that matters if a tenant claim is ever missing or malformed.
      const ghost = 'ten_does_not_exist';

      assert.equal(encounters.find(ghost, { pageSize: 100 }).total, 0);
      assert.equal(encounters.listClinicians(ghost).length, 0);
      assert.equal(schedule.listFacilities(ghost).length, 0);
      assert.equal(audit.find(ghost).total, 0);
      assert.throws(() => schedule.getDaySchedule(ghost, undefined, '2026-08-10'), NotFoundException);
    });
  });
});
