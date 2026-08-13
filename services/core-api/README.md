# Nexuvi Core API

Modular monolith backend: transactional API for all healthcare delivery domains.

**Blueprint:** §2.2 (NestJS), §10.2–10.3 (modular monolith), §11 (domain services), §17–18 (security, privacy).

## Status: Phase 0 — Foundations

Skeleton in place:
- TypeORM + PostgreSQL setup with RLS (Row-Level Security)
- NestJS module structure with clear domain boundaries
- Tenant hierarchy (CountryCell → Tenant → Organization → Facility → Department)
- Auth module skeleton (users, memberships, RBAC/ABAC)
- ADR-0003: modular monolith architecture decision

**Not yet:**
- Database migration system
- Cognito integration
- Event bus (transactional outbox)
- Endpoint implementations
- Tests

## Module Structure

```
domain/
  tenant/         # Organization, facility, subscription (§3.1)
  auth/           # Users, memberships, roles, policies (§16–17)
  clinical/       # Encounters, notes, conditions, procedures (Phase 1)
  medication/     # Prescriptions, dispensing, inventory (Phase 1)
  orders/         # Service requests, specimens, results (Phase 1)
  pharmacy/       # Dispensing workflows (Phase 1)
  lab/            # Accessioning, validation, critical results (Phase 3)
  hospital/       # ADT, beds, wards, discharge (Phase 3)
  billing/        # Charges, invoices, claims (Phase 4)
  referral/       # Cross-facility referrals (Phase 2)
  public_health/  # Surveillance, DHIS2 (Phase 2)
```

Each module:
- **Owns** its database tables (private)
- **Exports** a service for read access (queries)
- **Publishes** domain events for changes
- **Uses** event subscriptions for cross-module reactions
- **Cannot** directly access other modules' tables

See `../../../docs/adr/0003-modular-monolith-architecture.md`.

## Local Development

### Prerequisites

- Node 22+
- PostgreSQL 14+ (Docker/Colima/OrbStack)
- `.env.local` with:
  ```
  DB_HOST=localhost
  DB_PORT=5432
  DB_USER=nexuvi
  DB_PASSWORD=dev-password
  DB_NAME=nexuvi
  JWT_SECRET=dev-secret-change-in-prod
  NODE_ENV=development
  ```

### Setup

```bash
# Install dependencies
pnpm install

# Run database setup (migrations + seeds)
npm run db:migrate
npm run db:seed

# Start development server
npm run dev   # Watches for changes, reloads

# Type check
npm run typecheck

# Tests (when ready)
npm run test
```

### Database

Migrations live in `../../../database/migrations/` and are versioned.
RLS policies are in `../../../database/policies/rls-policies.sql`.

To add a new table:
1. Create a `.entity.ts` file in the domain module
2. Write a migration file in `database/migrations/`
3. Add RLS policies to `database/policies/`
4. Migrations run automatically on startup (§2.1)

### Testing

Authorization and RLS are tested at two levels:

1. **API tests**: does the endpoint return the right data for a user with role X?
2. **RLS tests**: does the database itself reject a user trying to access another tenant's data?

Example:

```typescript
it('Physician in clinic A cannot access clinic B records', async () => {
  // Set session: user is in clinic B
  connection.setConfig('nexuvi.current_tenant_id', 'clinic-b-id');
  
  // Try to query clinic A's encounters
  const result = await encounter.query({ tenantId: 'clinic-a-id' });
  
  // Should return empty (RLS filtered)
  expect(result).toHaveLength(0);
});
```

## Endpoints (Phase 1+)

- `GET /tenants/:tenantId` — Get organization details
- `GET /tenants/:tenantId/facilities` — List locations
- `POST /encounters` — Create encounter
- `GET /encounters/:encounterId` — Get encounter (with authorization)
- `POST /prescriptions` — Issue prescription
- `POST /orders` — Create lab/imaging order
- ... (full list in OpenAPI spec, Phase 1)

## Architecture Decisions

See:
- ADR-0003: modular monolith (why not microservices yet)
- Blueprint §10.2: module boundaries
- Blueprint §16–17: auth, RLS, audit

## Next Steps (Phase 0 → 1)

1. **Database migrations**: finalize schema for all tables
2. **Cognito integration**: authenticate against real IDP
3. **Event bus**: transactional outbox + worker service
4. **Endpoints**: implement Phase 1 routes (encounter, prescription, order)
5. **Tests**: authorization matrix tests, RLS tests, e2e scenarios

## Blocked On

- Container runtime for local Postgres (Docker Desktop, OrbStack, or Colima)
