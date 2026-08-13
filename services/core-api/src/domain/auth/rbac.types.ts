/**
 * Role-based and attribute-based access control.
 *
 * Blueprint §3.2 specifies the role matrix (Platform Owner through Patient).
 * §16.1 requires: Cognito for authentication, Nexuvi for authorization.
 * §17.3 requires: tenant context from trusted routing/session, never from request body.
 */

/**
 * A user identity: the person signing into Nexuvi.
 * Separate from patient identity (a person receiving care).
 * Stored in the Nexuvi control plane or country cell depending on scope.
 */
export interface User {
  readonly id: string; // UUID, immutable
  readonly externalId: string; // From Cognito / identity provider
  readonly email: string;
  readonly phone?: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly mfaEnabled: boolean;
  readonly lastSignInAt?: Date;
  readonly createdAt: Date;
}

/**
 * A user's relationship to an organization/facility/department and their assigned role.
 * One user can have multiple memberships across different tenants and facilities.
 * Blueprint §16.2: a user signs in once, then explicitly switches organization context.
 */
export interface Membership {
  readonly id: string; // UUID
  readonly userId: string; // Foreign key to User
  readonly organizationId: string; // Foreign key to Organization
  readonly facilityIds: readonly string[]; // Which facilities at this organization (empty = all)
  readonly departmentIds: readonly string[]; // Which departments (empty = all)
  readonly roles: readonly string[]; // 'physician', 'nurse', 'pharmacist', 'admin', etc.
  readonly specialties?: readonly string[]; // 'general_practice', 'pediatrics', 'emergency'
  readonly licenseNumber?: string; // Medical license ID, if applicable
  readonly licenseExpiry?: Date;
  readonly isActive: boolean;
  readonly invitedAt?: Date;
  readonly acceptedAt?: Date;
  readonly createdAt: Date;
}

/**
 * A role is a collection of capabilities, customized per country and tenant.
 * Blueprint §3.2 defines platform-wide roles (Platform Owner, Physician, Nurse, Patient, etc.).
 * Each role can be overridden or extended by country or tenant policy.
 */
export interface Role {
  readonly id: string; // UUID
  readonly countryCellId?: string; // If null, this is a platform-wide role
  readonly tenantId?: string; // If null, applies to all tenants in the cell
  readonly name: string; // 'physician', 'nurse', 'pharmacist', 'billing_officer', etc.
  readonly description: string;
  readonly capabilities: readonly string[]; // 'encounter:write', 'prescription:sign', 'patient:merge', etc.
  readonly constraints?: RoleConstraint[]; // Field-level rules (e.g., "cannot access mental_health notes")
  readonly createdAt: Date;
}

/**
 * A field-level constraint on a role's access.
 * Used for sensitive categories: mental health, substance abuse, sexual health, etc.
 */
export interface RoleConstraint {
  readonly field: string; // e.g. 'note_category', 'medication_category'
  readonly excludedValues: readonly string[]; // e.g. ['mental_health', 'substance_abuse']
  readonly reason: string; // Audit trail: why this constraint exists
}

/**
 * A policy is a reusable set of rules that can be assigned to multiple users or roles.
 * Policies are scoped by country and tenant.
 *
 * Example policies:
 * - "Can view own department's records only"
 * - "Can verify prescriptions for approved drugs only"
 * - "Can export aggregate data, not identified data"
 */
export interface Policy {
  readonly id: string; // UUID
  readonly countryCellId?: string;
  readonly tenantId?: string;
  readonly name: string; // 'department_isolation', 'formulary_verification_only', etc.
  readonly rules: PolicyRule[];
  readonly description: string;
  readonly createdAt: Date;
}

export interface PolicyRule {
  readonly resource: string; // 'encounter', 'prescription', 'patient_record', 'export'
  readonly action: string; // 'read', 'write', 'sign', 'delete'
  readonly condition?: string; // JSON logic or plain description of conditional access
  readonly comment?: string;
}

/**
 * Authorization decision: the result of evaluating a request against tenant policy.
 * Stored for audit (blueprint §17.4).
 */
export interface AuthorizationDecision {
  readonly id: string; // UUID
  readonly userId: string;
  readonly representedUserId?: string; // If this was a support impersonation (§16.3)
  readonly tenantId: string;
  readonly organizationId?: string;
  readonly facilityId?: string;
  readonly resource: string; // What was being accessed ('patient:123', 'encounter:456', etc.)
  readonly action: string; // What was being done ('read', 'write', 'sign', 'delete')
  readonly decision: 'allow' | 'deny';
  readonly reason?: string; // Why it was allowed or denied (for audit)
  readonly policyId?: string; // Which policy applied
  readonly timestamp: Date;
  readonly ipAddress?: string;
  readonly deviceId?: string;
}

/**
 * Break-glass access: emergency access to records when normal authorization would deny.
 * Blueprint §16.4: requires reason, elevated auth, minimal time, alerting, post-use review.
 * Never used to bypass authorization permanently; always audited and time-boxed.
 */
export interface BreakGlassSession {
  readonly id: string; // UUID
  readonly userId: string; // The person accessing
  readonly patientId: string; // Whose record was accessed
  readonly reason: string; // Required by law: why was this access needed
  readonly approverUserId?: string; // Who approved this (if required by country policy)
  readonly startedAt: Date;
  readonly expiresAt: Date; // Usually 1–4 hours
  readonly viewedFields: readonly string[]; // What was actually accessed (audit trail)
  readonly endedAt?: Date; // When the session closed
  readonly notifiedPatientAt?: Date; // If country policy requires patient notification
  readonly reviewedAt?: Date;
  readonly reviewerUserId?: string;
  readonly reviewNotes?: string;
}

/**
 * Support access: a support agent temporarily accessing a customer's account
 * to diagnose configuration, connectivity, or workflow issues (§16.3).
 * Never silent; always visible, time-limited, scoped, and audited.
 */
export interface SupportSession {
  readonly id: string; // UUID
  readonly supportUserId: string; // The support agent
  readonly targetUserId: string; // The customer user being represented
  readonly targetTenantId: string;
  readonly targetRole: string; // The role they are viewing as (e.g., 'physician', 'nurse')
  readonly caseId: string; // Ticket or support case ID (if applicable)
  readonly purpose: string; // Why they needed access (audit trail)
  readonly approvedAt: Date; // When was this access approved
  readonly approverUserId: string; // Who approved it
  readonly startedAt: Date;
  readonly expiresAt: Date; // Usually 30 min to 2 hours
  readonly endedAt?: Date;
  readonly actionsLog: readonly SupportAction[]; // Every action taken is logged
  readonly ipAddress: string;
}

export interface SupportAction {
  readonly timestamp: Date;
  readonly action: string; // e.g. 'viewed_encounter', 'checked_config', 'ran_diagnostic'
  readonly resource?: string; // What was accessed
  readonly details?: Record<string, unknown>;
}

/**
 * Permission constant: used in capability checks and policy rules.
 * Each follows the pattern "resource:action". Not exhaustive; new permissions
 * are added as the product grows. Organized by domain (clinical, billing, admin, etc.).
 *
 * Blueprint §3.2 defines role matrix; these are the building blocks.
 */
export const PERMISSIONS = {
  // Clinical record
  ENCOUNTER_READ: 'encounter:read',
  ENCOUNTER_WRITE: 'encounter:write',
  ENCOUNTER_SIGN: 'encounter:sign',
  NOTE_WRITE: 'note:write',
  NOTE_AMEND: 'note:amend',
  NOTE_READ_SENSITIVE: 'note:read_sensitive', // Mental health, sexual health, etc.

  // Medication
  PRESCRIPTION_ISSUE: 'prescription:issue',
  PRESCRIPTION_VERIFY: 'prescription:verify',
  MEDICATION_ADMIN: 'medication:admin',
  CONTROLLED_SUBSTANCE_PRESCRIBE: 'medication:controlled_prescribe',

  // Orders & results
  ORDER_PLACE: 'order:place',
  RESULT_ACKNOWLEDGE: 'result:acknowledge',
  CRITICAL_RESULT_HANDLE: 'result:critical_handle',

  // Patient
  PATIENT_REGISTER: 'patient:register',
  PATIENT_MERGE: 'patient:merge', // High-risk, requires approval
  PATIENT_DELETE: 'patient:delete', // Rare, audit required

  // Billing
  INVOICE_CREATE: 'invoice:create',
  PAYMENT_PROCESS: 'payment:process',
  REFUND_ISSUE: 'refund:issue', // High-risk
  CLAIM_SUBMIT: 'claim:submit',

  // Admin & config
  ROLE_ASSIGN: 'role:assign',
  PERMISSION_GRANT: 'permission:grant',
  CONFIG_WRITE: 'config:write',
  TENANT_CONFIG_EDIT: 'tenant:config_edit',

  // Break-glass & support
  BREAK_GLASS_INVOKE: 'break_glass:invoke',
  SUPPORT_ACCESS_APPROVE: 'support:approve',

  // Export & analytics
  EXPORT_IDENTIFIED: 'export:identified', // Usually restricted
  EXPORT_DEIDENTIFIED: 'export:deidentified', // More permissive
  ANALYTICS_VIEW: 'analytics:view',

  // Audit & compliance
  AUDIT_LOG_VIEW: 'audit:view',
  AUDIT_LOG_EXPORT: 'audit:export',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
