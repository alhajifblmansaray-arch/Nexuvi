/**
 * The capability catalogue.
 *
 * Canonical home for permission strings, in `infrastructure` rather than `domain/auth`
 * because guards on every route need them and `domain/auth` only loads under the Postgres
 * driver. `domain/auth/rbac.types.ts` describes the *storage* shape of roles and policies;
 * this is the vocabulary those roles are written in.
 *
 * Every permission follows `resource:action`. Adding a route means adding its capability
 * here first — `PermissionGuard` fails closed, so an unlisted route is unreachable rather
 * than unprotected.
 */
export const PERMISSIONS = {
  // Read models
  DASHBOARD_READ: 'dashboard:read',
  SCHEDULE_READ: 'schedule:read',
  FACILITY_READ: 'facility:read',

  // Clinical record
  ENCOUNTER_READ: 'encounter:read',
  ENCOUNTER_WRITE: 'encounter:write',
  ENCOUNTER_ASSIGN: 'encounter:assign',
  ENCOUNTER_SIGN: 'encounter:sign',
  NOTE_READ_SENSITIVE: 'note:read_sensitive',

  // Medication
  PRESCRIPTION_ISSUE: 'prescription:issue',
  PRESCRIPTION_VERIFY: 'prescription:verify',
  CONTROLLED_SUBSTANCE_PRESCRIBE: 'medication:controlled_prescribe',

  // Orders and results
  ORDER_PLACE: 'order:place',
  RESULT_ACKNOWLEDGE: 'result:acknowledge',

  // Patient
  PATIENT_REGISTER: 'patient:register',
  PATIENT_MERGE: 'patient:merge',

  // Billing
  INVOICE_CREATE: 'invoice:create',
  PAYMENT_PROCESS: 'payment:process',

  /**
   * Platform capabilities.
   *
   * Held by Nexuvi staff, never by a tenant administrator — these act *across* customers.
   * Note what is absent: any capability to read a customer's clinical data. A platform
   * operator can create a tenant and cannot see its patients. When someone genuinely needs
   * to, that is a support session (§16.3): consented, time-boxed, visible to the customer,
   * and separately audited. Conflating the two turns a provisioning tool into a back door
   * into every clinic on the platform.
   */
  PLATFORM_TENANT_PROVISION: 'platform:tenant_provision',
  PLATFORM_TENANT_SUSPEND: 'platform:tenant_suspend',
  PLATFORM_TENANT_READ: 'platform:tenant_read',

  // Governance
  AUDIT_READ: 'audit:read',
  ROLE_ASSIGN: 'role:assign',
  CONFIG_WRITE: 'config:write',
  BREAK_GLASS_INVOKE: 'break_glass:invoke',

  // Export
  EXPORT_IDENTIFIED: 'export:identified',
  EXPORT_DEIDENTIFIED: 'export:deidentified',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Role presets.
 *
 * A convenience for seeding and development, not the authorization model: real roles are
 * tenant-scoped rows (`domain/auth/rbac.types.ts`) so a country or clinic can vary them.
 * These are what those rows look like when nobody has customised anything.
 *
 * Note what the nurse preset lacks. `EXPORT_IDENTIFIED` and `AUDIT_READ` are absent by
 * default because the least-privilege default has to be the *quiet* one — a preset that
 * grants everything and expects administrators to remove capabilities gets deployed as-is.
 */
export const ROLE_PRESETS: Readonly<Record<string, readonly Permission[]>> = {
  /**
   * Nexuvi staff who onboard customers.
   *
   * Deliberately holds no clinical capability at all — not `encounter:read`, not
   * `audit:read`. Being able to create a clinic is not being able to look inside one.
   */
  'platform-operator': [
    PERMISSIONS.PLATFORM_TENANT_PROVISION,
    PERMISSIONS.PLATFORM_TENANT_READ,
  ],

  administrator: [
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.SCHEDULE_READ,
    PERMISSIONS.FACILITY_READ,
    PERMISSIONS.ENCOUNTER_READ,
    PERMISSIONS.ENCOUNTER_ASSIGN,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.ROLE_ASSIGN,
    PERMISSIONS.CONFIG_WRITE,
    PERMISSIONS.EXPORT_DEIDENTIFIED,
  ],
  physician: [
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.SCHEDULE_READ,
    PERMISSIONS.FACILITY_READ,
    PERMISSIONS.ENCOUNTER_READ,
    PERMISSIONS.ENCOUNTER_WRITE,
    PERMISSIONS.ENCOUNTER_ASSIGN,
    PERMISSIONS.ENCOUNTER_SIGN,
    PERMISSIONS.PRESCRIPTION_ISSUE,
    PERMISSIONS.ORDER_PLACE,
    PERMISSIONS.RESULT_ACKNOWLEDGE,
  ],
  nurse: [
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.SCHEDULE_READ,
    PERMISSIONS.FACILITY_READ,
    PERMISSIONS.ENCOUNTER_READ,
    PERMISSIONS.RESULT_ACKNOWLEDGE,
  ],
  receptionist: [
    PERMISSIONS.SCHEDULE_READ,
    PERMISSIONS.FACILITY_READ,
    PERMISSIONS.ENCOUNTER_READ,
  ],
};

export function permissionsForRoles(roles: readonly string[]): readonly Permission[] {
  return [...new Set(roles.flatMap((role) => ROLE_PRESETS[role] ?? []))];
}
