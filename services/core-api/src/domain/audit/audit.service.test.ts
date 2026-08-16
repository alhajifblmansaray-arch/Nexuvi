import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { AuditActor } from '@nexuvi/api-contracts';

import { AuditService } from './audit.service';
/**
 * A unique tenant per test.
 *
 * The audit log is persisted module state now, so every `new AuditService()` shares one
 * array. Isolating by tenant rather than by instance is closer to how the log actually
 * behaves in production — and it exercises the tenant filter on every assertion.
 */
let tenantSeq = 0;
function nextTenant(): string {
  tenantSeq += 1;
  return `ten_test_${tenantSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

const ACTOR: AuditActor = {
  userId: 'usr_test',
  displayName: 'Test Operator',
  role: 'Operations lead',
};

let TENANT = nextTenant();

function event(overrides: Partial<Parameters<AuditService['append']>[0]> = {}) {
  return {
    tenantId: TENANT,
    action: 'encounter.assigned' as const,
    actor: ACTOR,
    subject: { type: 'encounter' as const, id: 'enc_0001', reference: 'ENC-10847' },
    facilityId: 'fac_test',
    changes: [{ field: 'clinicianId', from: null, to: 'usr_102' }],
    ...overrides,
  };
}

describe('AuditService', () => {
  beforeEach(() => {
    TENANT = nextTenant();
  });

  describe('append', () => {
    it('assigns its own id and timestamp rather than trusting the caller', () => {
      const audit = new AuditService();
      const recorded = audit.append(event());

      assert.match(recorded.id, /^aud_\d{6}$/);
      assert.ok(
        !Number.isNaN(Date.parse(recorded.occurredAt)),
        'occurredAt must be a parseable timestamp',
      );
    });

    it('issues ids in strictly increasing order', () => {
      const audit = new AuditService();
      const ids = [audit.append(event()), audit.append(event()), audit.append(event())].map(
        (e) => e.id,
      );

      assert.deepEqual(ids, [...ids].sort(), 'ids must be monotonic so history cannot reorder');
      assert.equal(new Set(ids).size, 3);
    });

    it('defaults source to api when the caller does not state one', () => {
      const audit = new AuditService();
      assert.equal(audit.append(event()).source, 'api');
      assert.equal(audit.append(event({ source: 'ui' })).source, 'ui');
    });

    it('omits reason entirely when none is given', () => {
      const audit = new AuditService();
      // Distinct from `reason: undefined` — an absent key means "not stated", which is
      // what a reviewer reading the log needs to be able to tell.
      assert.ok(!('reason' in audit.append(event())));
      assert.equal(audit.append(event({ reason: 'Cover gap' })).reason, 'Cover gap');
    });
  });

  describe('immutability', () => {
    it('freezes the returned event, its actor, and its changes', () => {
      const audit = new AuditService();
      const recorded = audit.append(event());

      assert.ok(Object.isFrozen(recorded));
      assert.ok(Object.isFrozen(recorded.actor));
      assert.ok(Object.isFrozen(recorded.subject));
      assert.ok(Object.isFrozen(recorded.changes));
      assert.ok(Object.isFrozen(recorded.changes[0]));
    });

    it('does not let a caller rewrite history through the object it was handed', () => {
      const audit = new AuditService();
      const recorded = audit.append(event());

      assert.throws(() => {
        (recorded as { action: string }).action = 'encounter.unassigned';
      }, TypeError);

      assert.equal(audit.find(TENANT).items[0]?.action, 'encounter.assigned');
    });

    it('is unaffected by later mutation of the caller-supplied actor object', () => {
      const audit = new AuditService();
      const mutableActor = { ...ACTOR };
      audit.append(event({ actor: mutableActor }));

      mutableActor.displayName = 'Someone Else';

      // Attribution is captured at the time of the action; §19 makes it a historical fact.
      assert.equal(audit.find(TENANT).items[0]?.actor.displayName, 'Test Operator');
    });

    it('exposes no way to update or delete an entry', () => {
      const audit = new AuditService();
      const surface = Object.getOwnPropertyNames(AuditService.prototype);
      assert.deepEqual(surface.sort(), ['append', 'constructor', 'find', 'findForSubject']);
    });
  });

  describe('find', () => {
    it('returns most recent first', () => {
      const audit = new AuditService();
      audit.append(event({ subject: { type: 'encounter', id: 'enc_1', reference: 'A' } }));
      audit.append(event({ subject: { type: 'encounter', id: 'enc_2', reference: 'B' } }));

      assert.deepEqual(
        audit.find(TENANT).items.map((e) => e.subject.reference),
        ['B', 'A'],
      );
    });

    it('filters by subject, action, and actor', () => {
      const audit = new AuditService();
      audit.append(event({ subject: { type: 'encounter', id: 'enc_1', reference: 'A' } }));
      audit.append(
        event({
          action: 'encounter.unassigned',
          subject: { type: 'encounter', id: 'enc_2', reference: 'B' },
          reason: 'Shift ended',
        }),
      );
      audit.append(
        event({
          actor: { userId: 'usr_other', displayName: 'Other', role: 'Nurse' },
          subject: { type: 'encounter', id: 'enc_1', reference: 'A' },
        }),
      );

      assert.equal(audit.find(TENANT, { subjectId: 'enc_1' }).total, 2);
      assert.equal(audit.find(TENANT, { action: 'encounter.unassigned' }).total, 1);
      assert.equal(audit.find(TENANT, { actorId: 'usr_other' }).total, 1);
    });

    it('paginates without losing the total', () => {
      const audit = new AuditService();
      for (let i = 0; i < 12; i += 1) audit.append(event());

      const page = audit.find(TENANT, { page: 2, pageSize: 5 });
      assert.equal(page.items.length, 5);
      assert.equal(page.total, 12);
      assert.equal(page.page, 2);
    });

    it('clamps a hostile page size instead of allocating whatever is asked for', () => {
      const audit = new AuditService();
      audit.append(event());
      assert.equal(audit.find(TENANT, { pageSize: 10_000 }).pageSize, 200);
      assert.equal(audit.find(TENANT, { pageSize: -5 }).pageSize, 1);
    });
  });

  describe('findForSubject', () => {
    it('returns one encounter’s history oldest first', () => {
      const audit = new AuditService();
      audit.append(
        event({ subject: { type: 'encounter', id: 'enc_1', reference: 'A' }, action: 'encounter.assigned' }),
      );
      audit.append(event({ subject: { type: 'encounter', id: 'enc_2', reference: 'B' } }));
      audit.append(
        event({
          subject: { type: 'encounter', id: 'enc_1', reference: 'A' },
          action: 'encounter.reassigned',
        }),
      );

      assert.deepEqual(
        audit.findForSubject(TENANT, 'enc_1').map((e) => e.action),
        ['encounter.assigned', 'encounter.reassigned'],
      );
    });
  });
});
