# Nexuvi

One platform. Every patient. Every provider. One connected health system.

The unified operating platform for healthcare delivery, medication, diagnostics,
financing, patient engagement, and public-health intelligence.

Architecture of record: **Nexuvi Master Architecture Blueprint v1.0** (August 2026).
Section references throughout this repo (`§3.3`, `§10.2`, …) point at that document.

## Status

**Phase 0 — Architecture and foundations.** Workspace scaffolding is in place. No
application code yet.

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

These come from the blueprint and are not stylistic preferences:

- **No production data outside production.** Local, dev, and staging use synthetic data
  only. Production is never cloned into a lower environment (§26.3).
- **Default deny.** Hiding a control in the frontend is not authorization. Every protected
  request is authorized in the API and, for tenant isolation, again in PostgreSQL
  row-level security (§3.2, §8.1).
- **Tenant context comes from trusted routing or session state**, never from a
  user-supplied header or request body (§17.3).
- **Secrets never enter source control or CI logs.** Local development uses `.env.local`
  with development-only values; everything else uses AWS Secrets Manager (§2.1).
- **Signed clinical records are immutable.** Corrections create addenda or superseding
  versions. Financial postings reverse, they do not delete (§8.3).
- **Done means done.** A capability ships when permissions, audit, tenancy, offline
  behaviour, accessibility, localization, observability, support, migration, performance,
  clinical safety, documentation, tests, and rollback are all addressed — not when the
  screen works (§28.3).

## Architecture decisions

Recorded in [`docs/adr/`](docs/adr/). Read these before proposing a structural change.

## Local environment

Blueprint §2.1 specifies Docker Compose for PostgreSQL, Redis, LocalStack (S3/SQS),
Mailpit, and a local identity-provider mode. **No container runtime is installed on this
machine yet** — install Docker Desktop, Colima, or OrbStack before Phase 0 backend work
begins.

## Confidential

Product and technical planning material. Not for distribution.
