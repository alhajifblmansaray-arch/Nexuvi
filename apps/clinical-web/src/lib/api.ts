import type {
  AuditEvent,
  ClinicianAvailability,
  DaySchedule,
  EncounterQuery,
  EncounterSummary,
  FacilitySummary,
  OperationsDashboard,
  Paginated,
} from '@nexuvi/api-contracts';

import { clinicHost, getAccessToken } from './session';

/**
 * Typed client for the Nexuvi core API.
 *
 * Two decisions worth stating:
 *
 * **No caching.** These are operational reads whose whole value is being current. A
 * dashboard served from the Next.js data cache would show a clinician a queue that drained
 * ten minutes ago, which is worse than showing them nothing.
 *
 * **Failures surface.** {@link ApiError} propagates to the page, which renders an explicit
 * degraded state. Falling back to placeholder figures would make an outage look like a
 * quiet shift.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/** How long to wait before treating the API as unreachable. */
const TIMEOUT_MS = 8_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly url: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: { search?: URLSearchParams; method?: string; body?: unknown } = {},
): Promise<T> {
  const { search, method = 'GET', body } = options;
  const url = `${BASE_URL}${path}${search?.size ? `?${search}` : ''}`;

  const token = await getAccessToken();
  if (!token) {
    throw new ApiError('Not signed in.', 401, url);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        // Staff surfaces are per-clinic hosts too; the API uses it for tenant-scoped
        // public routes. `Host` cannot be set from Node's fetch — it is a forbidden
        // header name — so the clinic travels as `X-Forwarded-Host`.
        'x-forwarded-host': await clinicHost(),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    // Connection refused, DNS failure, or the timeout above. There is no status yet.
    const reason = cause instanceof Error ? cause.message : 'unknown error';
    throw new ApiError(`Could not reach the Nexuvi API (${reason})`, null, url);
  }


  if (!response.ok) {
    // The API states *why* it refused — an off-shift clinician, a missing capability.
    // That sentence is written for the person at the screen, so it is surfaced rather
    // than replaced with a status code they cannot act on.
    throw new ApiError(await explain(response), response.status, url);
  }

  return (await response.json()) as T;
}

/**
 * Extract the server's own wording.
 *
 * The API answers errors as RFC 9457 problem documents, so `detail` is the sentence meant
 * for the reader. Nest's own validation shape is accepted too, for anything thrown before
 * the filter formats it.
 */
async function explain(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      detail?: string;
      errors?: string[];
      message?: string | string[];
    };
    if (body.errors?.length) return body.errors.join('. ');
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.message)) return body.message.join('. ');
    if (typeof body.message === 'string') return body.message;
  } catch {
    // Non-JSON error body; fall through to the generic wording.
  }
  return `The Nexuvi API returned ${response.status} ${response.statusText}`;
}

export function getOperationsDashboard(): Promise<OperationsDashboard> {
  return request<OperationsDashboard>('/dashboard/operations');
}

export function getEncounters(query: EncounterQuery = {}): Promise<Paginated<EncounterSummary>> {
  const search = new URLSearchParams();
  if (query.status) search.set('status', query.status);
  if (query.department) search.set('department', query.department);
  if (query.search) search.set('search', query.search);
  if (query.page) search.set('page', String(query.page));
  if (query.pageSize) search.set('pageSize', String(query.pageSize));
  return request<Paginated<EncounterSummary>>('/encounters', { search });
}

export function getDepartments(): Promise<readonly string[]> {
  return request<readonly string[]>('/encounters/departments');
}

/** Facilities the current user can switch between. */
export function getFacilities(): Promise<readonly FacilitySummary[]> {
  return request<readonly FacilitySummary[]>('/facilities');
}

export function getSchedule(facilityId?: string, date?: string): Promise<DaySchedule> {
  const search = new URLSearchParams();
  if (facilityId) search.set('facilityId', facilityId);
  if (date) search.set('date', date);
  return request<DaySchedule>('/schedule', { search });
}

export function getEncounter(reference: string): Promise<EncounterSummary> {
  return request<EncounterSummary>(`/encounters/${encodeURIComponent(reference)}`);
}

export function getEncounterHistory(reference: string): Promise<readonly AuditEvent[]> {
  return request<readonly AuditEvent[]>(
    `/encounters/${encodeURIComponent(reference)}/history`,
  );
}

export function getClinicians(): Promise<readonly ClinicianAvailability[]> {
  return request<readonly ClinicianAvailability[]>('/encounters/clinicians');
}

export interface TeamMember {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly roles: readonly string[];
  readonly status: string;
  readonly createdAt: string;
}

export interface PendingInvite {
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly expiresAt: string;
  readonly invitedByName: string;
}

export function getTeam(): Promise<{ members: TeamMember[]; pending: PendingInvite[] }> {
  return request<{ members: TeamMember[]; pending: PendingInvite[] }>('/identity/team');
}

export function inviteColleague(
  email: string,
  displayName: string,
  roles: readonly string[],
): Promise<{ token: string; expiresAt: string }> {
  return request<{ token: string; expiresAt: string }>('/identity/invitations', {
    method: 'POST',
    body: { email, displayName, roles },
  });
}

export function assignEncounter(
  reference: string,
  clinicianId: string | null,
  reason?: string,
): Promise<EncounterSummary> {
  return request<EncounterSummary>(`/encounters/${encodeURIComponent(reference)}/assign`, {
    method: 'POST',
    body: { clinicianId, ...(reason?.trim() ? { reason: reason.trim() } : {}) },
  });
}
