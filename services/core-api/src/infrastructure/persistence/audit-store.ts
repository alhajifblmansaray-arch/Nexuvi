import type { AuditEvent } from '@nexuvi/api-contracts';

import { persist, persistArray } from './snapshot';

/**
 * The append-only audit log's backing store.
 *
 * Module-level rather than a field on `AuditService` so it can be persisted alongside
 * everything else. An audit trail that vanishes on restart is not an audit trail — §19
 * requires the record to outlive the action, and "the process was restarted" is not an
 * acceptable gap in it.
 *
 * The append-only guarantee still lives in `AuditService`: this exposes an array, and the
 * service is the only thing that touches it.
 */
const EVENTS: AuditEvent[] = [];

persistArray('auditEvents', EVENTS);

export const auditStore = {
  all(): readonly AuditEvent[] {
    return EVENTS;
  },

  append(event: AuditEvent): void {
    EVENTS.push(event);
    persist();
  },

  /** Highest sequence issued so far, so ids stay monotonic across a restart. */
  count(): number {
    return EVENTS.length;
  },
};
