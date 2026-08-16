'use server';

import { revalidatePath } from 'next/cache';

import { ApiError, assignEncounter } from '../../../lib/api';

export interface AssignResult {
  readonly ok: boolean;
  /** The server's own explanation when it refused. Written for the person at the screen. */
  readonly message?: string;
}

/**
 * Assign, reassign, or unassign an encounter.
 *
 * A server action rather than a browser fetch so the API stays reachable from one origin
 * and the browser never needs credentials for it. Business rules — off-shift clinicians,
 * required reasons, closed encounters — are enforced by the API, not re-implemented here;
 * this returns the refusal for display rather than pre-empting it, so there is exactly one
 * place those rules live.
 */
export async function assignEncounterAction(
  reference: string,
  clinicianId: string | null,
  reason?: string,
): Promise<AssignResult> {
  try {
    await assignEncounter(reference, clinicianId, reason);
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  // The assignment changes the dashboard's unassigned count and queue chart too, so both
  // surfaces are invalidated rather than just the one the user is looking at.
  revalidatePath('/');
  revalidatePath('/encounters');
  revalidatePath(`/encounters/${reference}`);

  return { ok: true };
}
