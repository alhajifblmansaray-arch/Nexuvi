# Nexuvi

One platform. Every patient. Every provider. One connected health system.

The unified operating platform for healthcare delivery, medication, diagnostics,
financing, patient engagement, and public-health intelligence.

Architecture of record: **Nexuvi Master Architecture Blueprint v1.0** (August 2026).
Section references throughout this repo (`§3.3`, `§10.2`, …) point at that document.

## Status

**Phase 0 — Architecture and foundations.** Two commits complete:

1. **Design system** (packages/design-system):
   - Three-layer token system with 40 passing tests
   - Monochrome black/white base with mint/coral/lavender accents
   - 12-colour data-visualization palette (CVD-accessible, 2.4:1 minimum contrast)
   - Tenant theming: clinics pick their brand colour, platform ensures accessibility
   - Token specimen page (generated, cannot drift from code)

2. **Core API** (services/core-api):
   - NestJS modular monolith skeleton
   - Tenant hierarchy and RBAC/ABAC types
   - PostgreSQL RLS policies for tenant isolation
   - Module structure with clear boundaries
   - ADR-0003: modular monolith decision (when to extract services)

No running code yet. Blocked on: container runtime for Postgres local testing.

## Layout

| Path | Contains |
| --- | --- |
| `apps/` | `platform-admin`, `organization-admin`, `clinical-web`, `patient-portal`, `public-site` |
| `services/` | `core-api` (modular monolith), `worker`, `interoperability`, `ai-gateway` |
| `packages/` | `design-system`, `auth-client`, `api-contracts`, `fhir-profiles`, `terminology`, `tenant-config`, `observability`, `test-fixtures` |
| `infrastructure/terraform/` | `modules`, `environments`, `country-cells` |
| `database/` | `migrations`, `seeds`, `policies` (RLS policies and database roles) |
| `docs/` | `adr`, `threat-models`, `runbooks`, `clinical-safety`, `integration-guides` |
| `brand/` | Source branding assets (logo, type, palette references) |

Layout follows blueprint §2.3 and is created in full up front, so later phases land
somewhere that already exists.

## Getting started

Requires Node 22+ and Corepack (bundled with Node).

```bash
corepack enable pnpm && pnpm install
```

Local services (PostgreSQL, Redis, LocalStack, Mailpit) arrive with `core-api` and need a
container runtime — see [Local environment](#local-environment).

## Ground rules

These are enforced by code and tests, not style guides:

- **Tenant isolation by database default.** RLS policies are the second layer after API
  authorization (§17.3). Every tenant-scoped table has RLS. Tests verify "user in org A
  cannot see org B data" at the database level, not just the API.

- **Module boundaries are real.** A clinical module reaching into pharmacy's private
  tables is a test failure (§10.2). Architecture tests scan imports; circular dependencies
  are build errors. Cross-module communication is through queries (immediate) or events
  (eventual).

- **Tenant context from routing only.** API middleware sets
  `nexuvi.current_tenant_id` and other session variables from the authenticated route
  context, not from request body (§16.1). The database enforces this rule via RLS.

- **No production data in lower environments** (§26.3). Local, dev, staging use
  synthetic generated data only. Production is never cloned, never de-identified
  "for testing".

- **Secrets in `.env.local` or AWS Secrets Manager.** Never in `.env`, never in
  CLAUDE.md, never in git history (§2.1).

- **Clinical records are immutable when signed** (§8.3). Corrections create addenda or
  new versions. Billing postings reverse, never delete.

- **Accessibility is mandatory, not a feature.** Every interface element and every
  colour has a contrast ratio test. WCAG 2.2 AA is the floor. No "we'll fix it later"
  (§30).

## Architecture decisions

- [ADR-0001](docs/adr/0001-monorepo-and-toolchain.md): Monorepo with pnpm, Turborepo, strict TypeScript, isolated node_modules.
- [ADR-0002](docs/adr/0002-brand-tokens-and-tenant-theming.md): Three-layer token system, monochrome base, tenant brand overrides with contrast validation.
- [ADR-0003](docs/adr/0003-modular-monolith-architecture.md): NestJS modular monolith until domain load becomes unbalanced or team structure changes.

Read these before proposing a structural change.

## Local environment

Blueprint §2.1 specifies Docker Compose for PostgreSQL, Redis, LocalStack (S3/SQS),
Mailpit, and a local identity-provider mode. **No container runtime is installed on this
machine yet** — install Docker Desktop, Colima, or OrbStack before Phase 0 backend work
begins.

## Confidential

Product and technical planning material. Not for distribution.
