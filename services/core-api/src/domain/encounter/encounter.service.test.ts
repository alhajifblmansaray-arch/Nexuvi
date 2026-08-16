import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuditActor } from '@nexuvi/api-contracts';

import { AuditService } from '../audit/audit.service';
import { EncounterService } from './encounter.service';
import { FREETOWN_GROUP } from '../../infrastructure/persistence/tenants';

const ACTOR: AuditActor = {
  userId: 'usr_test',
  displayName: 'Test Operator',
  role: 'Operations lead',
};

/** Roster ids from the fixture. */
const AVAILABLE = 'usr_102'; // Dr. Michael Sesay
const WITH_PATIENT = 'usr_101'; // Dr. Sarah Conteh
const OFF_SHIFT = 'usr_105'; // Dr. Joseph Mansaray

/** Fixture references with known starting states. */
const UNASSIGNED = 'ENC-10847'; // awaiting-review, no clinician
const ASSIGNED = 'ENC-10863'; // blocked, assigned to Dr. Sarah Conteh
const COMPLETED = 'ENC-10812';

let audit: AuditService;
let encounters: EncounterService;

/**
 * The clinical store is module-level singleton state, so assignment tests mutate a shared
 * fixture. Each test restores what it changed rather than relying on ordering.
 */
function restore(reference: string, clinicianId: string | null) {
  const service = new EncounterService(new AuditService());
  service.assign(FREETOWN_GROUP, reference, clinicianId, ACTOR, 'test teardown');
}

/**
 * Entries recorded before the test under way.
 *
 * The audit log is shared, persisted module state now, so "nothing was recorded" has to be
 * measured as a delta rather than as an absolute count.
 */
let auditBaseline = 0;

beforeEach(() => {
  audit = new AuditService();
  encounters = new EncounterService(audit);
  auditBaseline = audit.find(FREETOWN_GROUP, { pageSize: 200 }).total;
});

/** How many entries this test caused. */
function recorded(): number {
  return audit.find(FREETOWN_GROUP, { pageSize: 200 }).total - auditBaseline;
}

describe('EncounterService', () => {
  describe('find', () => {
    it('sorts open work above closed work regardless of urgency', () => {
      const items = encounters.find(FREETOWN_GROUP, { pageSize: 100 }).items;
      const firstClosed = items.findIndex(
        (e) => e.status === 'completed' || e.status === 'cancelled',
      );
      const lastOpen = items.findLastIndex(
        (e) => e.status !== 'completed' && e.status !== 'cancelled',
      );

      assert.ok(firstClosed > lastOpen, 'every closed encounter must sort below every open one');
    });

    it('orders open work by severity before waiting time', () => {
      const open = encounters
        .find(FREETOWN_GROUP, { pageSize: 100 })
        .items.filter((e) => e.status !== 'completed' && e.status !== 'cancelled');

      // A critical encounter waiting 11 minutes must outrank a high one waiting 96.
      const rank = { critical: 0, high: 1, warning: 2, info: 3, normal: 4 } as const;
      for (let i = 1; i < open.length; i += 1) {
        assert.ok(
          rank[open[i - 1]!.severity] <= rank[open[i]!.severity],
          `severity order broke at index ${i}`,
        );
      }
    });

    it('filters by status and by department', () => {
      assert.ok(
        encounters.find(FREETOWN_GROUP, { status: 'blocked' }).items.every((e) => e.status === 'blocked'),
      );
      assert.ok(
        encounters
          .find(FREETOWN_GROUP, { department: 'Paediatrics' })
          .items.every((e) => e.department === 'Paediatrics'),
      );
    });

    it('searches name, reference, and patient id case-insensitively', () => {
      // Asserted as a property rather than a count: a patient legitimately has several
      // encounters, and a magic number breaks every time the fixture grows.
      const byName = encounters.find(FREETOWN_GROUP, { search: 'fatmata' });
      assert.ok(byName.total > 0);
      assert.ok(byName.items.every((e) => e.patientName.toLowerCase().includes('fatmata')));

      // A reference is unique, so this one is exact.
      assert.equal(encounters.find(FREETOWN_GROUP, { search: 'ENC-10847' }).total, 1);
      assert.equal(encounters.find(FREETOWN_GROUP, { search: 'enc-10847' }).total, 1);
    });

    it('clamps page size rather than honouring an arbitrary request', () => {
      assert.equal(encounters.find(FREETOWN_GROUP, { pageSize: 5000 }).pageSize, 100);
      assert.equal(encounters.find(FREETOWN_GROUP, { pageSize: 0 }).pageSize, 1);
    });
  });

  describe('findByReference', () => {
    it('is case-insensitive', () => {
      assert.equal(encounters.findByReference(FREETOWN_GROUP, 'enc-10847').reference, 'ENC-10847');
    });

    it('throws NotFound for an unknown reference', () => {
      assert.throws(() => encounters.findByReference(FREETOWN_GROUP, 'ENC-00000'), NotFoundException);
    });
  });

  describe('assign', () => {
    it('assigns an unassigned encounter and records who did it', () => {
      const before = encounters.findByReference(FREETOWN_GROUP, UNASSIGNED);
      assert.equal(before.clinicianId, null);

      const updated = encounters.assign(FREETOWN_GROUP, UNASSIGNED, AVAILABLE, ACTOR);

      assert.equal(updated.clinicianId, AVAILABLE);
      assert.equal(updated.clinicianName, 'Dr. Michael Sesay');

      const entry = audit.findForSubject(FREETOWN_GROUP, updated.id).at(-1);
      assert.equal(entry?.action, 'encounter.assigned');
      assert.equal(entry?.actor.userId, 'usr_test');
      assert.deepEqual(entry?.changes[0], {
        field: 'clinicianId',
        from: null,
        to: AVAILABLE,
      });

      restore(UNASSIGNED, null);
    });

    it('labels a change between two clinicians as a reassignment', () => {
      encounters.assign(FREETOWN_GROUP, ASSIGNED, AVAILABLE, ACTOR);

      const entry = audit
        .findForSubject(FREETOWN_GROUP, encounters.findByReference(FREETOWN_GROUP, ASSIGNED).id)
        .at(-1);
      assert.equal(entry?.action, 'encounter.reassigned');
      assert.equal(entry?.changes[0]?.from, WITH_PATIENT);

      restore(ASSIGNED, WITH_PATIENT);
    });

    it('requires a reason to unassign, because it drops a live patient', () => {
      assert.throws(() => encounters.assign(FREETOWN_GROUP, ASSIGNED, null, ACTOR), BadRequestException);
      assert.throws(() => encounters.assign(FREETOWN_GROUP, ASSIGNED, null, ACTOR, '   '), BadRequestException);

      // And nothing was recorded for the refused attempt.
      assert.equal(recorded(), 0);
    });

    it('records the reason when unassigning', () => {
      const updated = encounters.assign(FREETOWN_GROUP, ASSIGNED, null, ACTOR, 'Shift ended, no cover');

      assert.equal(updated.clinicianId, null);
      // The newest entry: this subject accumulates history across the suite.
      const entry = audit.findForSubject(FREETOWN_GROUP, updated.id).at(-1);
      assert.equal(entry?.action, 'encounter.unassigned');
      assert.equal(entry?.reason, 'Shift ended, no cover');

      restore(ASSIGNED, WITH_PATIENT);
    });

    it('refuses a clinician who is not on the roster', () => {
      assert.throws(() => encounters.assign(FREETOWN_GROUP, UNASSIGNED, 'usr_nobody', ACTOR), NotFoundException);
      assert.equal(recorded(), 0);
    });

    it('refuses an off-shift clinician', () => {
      assert.throws(() => encounters.assign(FREETOWN_GROUP, UNASSIGNED, OFF_SHIFT, ACTOR), BadRequestException);
      assert.equal(encounters.findByReference(FREETOWN_GROUP, UNASSIGNED).clinicianId, null);
      assert.equal(recorded(), 0);
    });

    it('refuses to reassign a completed encounter', () => {
      assert.throws(() => encounters.assign(FREETOWN_GROUP, COMPLETED, AVAILABLE, ACTOR), BadRequestException);
      assert.equal(recorded(), 0);
    });

    it('is idempotent: reassigning to the same clinician records nothing', () => {
      encounters.assign(FREETOWN_GROUP, UNASSIGNED, AVAILABLE, ACTOR);
      assert.equal(recorded(), 1);

      encounters.assign(FREETOWN_GROUP, UNASSIGNED, AVAILABLE, ACTOR);
      assert.equal(recorded(), 1, 'a no-op must not add a second entry');

      restore(UNASSIGNED, null);
    });

    it('leaves state unchanged when it refuses', () => {
      const before = encounters.findByReference(FREETOWN_GROUP, ASSIGNED);
      assert.throws(() => encounters.assign(FREETOWN_GROUP, ASSIGNED, OFF_SHIFT, ACTOR));

      const after = encounters.findByReference(FREETOWN_GROUP, ASSIGNED);
      assert.equal(after.clinicianId, before.clinicianId);
      assert.equal(after.clinicianName, before.clinicianName);
    });
  });
});
