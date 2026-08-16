# Nexuvi

One platform. Every patient. Every provider. One connected health system.

The unified operating platform for healthcare delivery, medication, diagnostics,
financing, patient engagement, and public-health intelligence.

Architecture of record: **Nexuvi Master Architecture Blueprint v1.0** (August 2026).
Section references throughout this repo (`§3.3`, `§10.2`, …) point at that document.

## Status

**Phase 1 — Running vertical slice.** The operations dashboard works end to end: a
NestJS API serving aggregated read models, a shared contracts package, and a Next.js
clinical workspace rendering it.

1. **Design system** (`packages/design-system`):
   - Three-layer token system with 40 passing tests
   - Monochrome black/white base with mint/coral/lavender accents
   - 12-colour data-visualization palette (CVD-accessible, 2.4:1 minimum contrast)
   - Tenant theming: clinics pick their brand colour, platform ensures accessibility

2. **API contracts** (`packages/api-contracts`):
   - Wire-format types shared by the API and every front-end app
   - One source of truth per payload, so a server-side rename is a client compile error

3. **Core API** (`services/core-api`) — 136 tests:
   - `GET /api/dashboard/operations` — the dashboard as one consistent snapshot
   - `GET /api/encounters` — filter by status and department, search, paginate
   - `POST /api/encounters/:reference/assign` — assign, reassign, unassign
   - `GET /api/audit` and `GET /api/encounters/:reference/history` — the audit trail
   - `GET /api/facilities` and `GET /api/schedule` — roster coverage per site and day
   - Modular monolith with enforced boundaries; tenant hierarchy and RBAC/ABAC types
   - PostgreSQL RLS policies written and ready for the `postgres` driver

4. **Clinical workspace** (`apps/clinical-web`):
   - Operations dashboard: KPI strip, encounter-volume trend, queue and turnaround
     charts, needs-attention queue, integration health, roster, alerts
   - Encounters list with bookmarkable status filters
   - Encounter detail with a working assignment control and its audit trail
   - Day schedule across connected sites — see [Schedule](#schedule)
   - Light and dark themes generated from the token set, not hand-maintained

**Not yet built:** credential checking at sign-in, status transitions and closure, and
Postgres-backed persistence. See [Multi-tenancy](#multi-tenancy), [Security](#security),
[Data drivers](#data-drivers), and [Audit](#audit).

## Multi-tenancy

Many clinics and hospitals share this deployment, so **every read path is tenant-scoped and
none of them accepts a tenant from the request.** The tenant comes from the caller's
verified token claims (§17.3): a tenant that can be *asked for* is a tenant that can be
guessed.

Three things enforce that, rather than one:

1. **Required parameters.** Every store and service read takes `tenantId` as a required
   first argument, and there is no overload that omits it. A query written without a tenant
   is a compile error, not a breach. Introducing this turned twenty existing call sites red
   — which was the point of making it required rather than optional.
2. **A two-tenant fixture.** The seed holds a three-site clinic group *and* an unrelated
   hospital trust. A single-tenant fixture cannot detect a missing filter, because every
   query returns the right answer by accident.
3. **Negative tests** (`domain/tenant-isolation.test.ts`) — not "tenant A reads its own
   data" but "tenant A cannot read tenant B's", written per read path. A missing filter is
   one forgotten `.filter()` on one query, so a single generic check would miss it on the
   other five.

Facility resolution is scoped to the tenant *before* matching on id or slug. Checking
ownership afterwards would let another customer's slug resolve, and slugs are guessable in
a way ids are not. An out-of-scope facility returns the same message as a non-existent one.

An unknown or malformed tenant claim reads **nothing**, not everything. There is a test for
that specifically, because it is the failure mode that matters if a claim ever goes missing.

RLS (`database/migrations/0002_row_level_security.sql`) is the second layer. Neither layer
is trusted to be the only one; the database half needs a live Postgres to test.

## Security

Every route is authenticated and authorised by default. Both guards are registered
globally, so a new controller is protected the moment it is written rather than the moment
someone remembers to protect it.

**Authentication.** `AuthGuard` verifies a bearer token and puts the resulting principal in
`AsyncLocalStorage` for the request. Opting out is `@Public()` — visible and greppable, and
used only by the health probes and the dev-token endpoint.

**Authorisation.** `@RequirePermission(...)` declares what a route needs, and
`PermissionGuard` **fails closed**: an authenticated route with no annotation is refused,
not allowed. Forgetting to annotate a new clinical endpoint is the likeliest authorisation
mistake anyone will make here, and it should cost a 403 in development rather than an open
endpoint in production. Refusals name the missing capability, because "Forbidden" does not
survive the conversation with whoever has to grant it.

**Tenant scope and facility scope are separate, and both apply.** The tenant boundary
divides customers; the facility boundary divides sites within one customer. Different
failures, different blast radii — neither stands in for the other.

**Facility scope** is checked per request, not per route — the guard can answer "may this
session read schedules", but only the handler can answer "may it read *this* facility's".
`GET /facilities` is filtered to the caller's memberships, and an out-of-scope facility
returns the same message as a non-existent one, so the endpoint is not an enumeration
oracle over the tenant's estate.

**Tokens.** Two verification paths, and neither can become the other:

- **`dev`** — HS256 against a local secret, so the API is usable before the provider
  exists. The algorithm is *pinned*, not read from the header.
- **`jwks`** — RS256/384/512 against the provider's published keys, matched by `kid`, with
  key caching and rotation. Here the algorithm *is* read from the header, because providers
  legitimately rotate between the RS family — but it is checked against an allow-list of
  asymmetric algorithms first. Without that, a token claiming `HS256` makes the verifier
  treat the public key as a shared secret, and the public key is by definition something an
  attacker already has. There is a test that mounts exactly that forgery.

Signatures are compared with `timingSafeEqual`. `jwks` mode throws rather than falling back
to `dev` — an auth path that silently degrades is worse than one that is missing. Config
refuses `dev` mode when `NODE_ENV=production`, so that combination does not boot.

JWKS refreshes are rate-limited: without a cooldown, anyone could force unbounded outbound
requests by sending tokens with random key ids. A key set that fetches back empty is
discarded rather than installed, so a provider glitch does not become a total outage.

**Errors** are RFC 9457 problem documents. Expected refusals pass their wording through;
anything unexpected is logged server-side in full and answered with a generic sentence plus
a correlation id, because a stack trace or database error string can carry table names,
query fragments, and occasionally row values.

**Sessions.** The workspace has a sign-in screen and a per-identity session. The cookie is
`httpOnly`, `sameSite=lax`, `secure` outside development, and holds only the identity —
never a token, which stays server-side. Access tokens are cached *per identity*: a single
shared slot would hand one user's token to the next request from a different user, and
every audit entry after that would name the wrong person.

**What sign-in does not do yet: check a credential.** Choosing an identity proves nothing,
and the screen says so rather than implying a boundary it does not have. What it does fix
is attribution — each identity carries its own token, capabilities, and facility scope, so
the audit trail names whoever acted. Connecting the identity provider replaces that screen
with an OIDC callback; the shape around it (cookie session, per-user token, cache keyed by
identity) already assumes real sign-in.

## Schedule

`/schedule` answers two questions an administrator asks together: **who is working**, and
**where**. Sites are switched with the chips in the header, and the date travels with the
switch, so "Waterloo on Tuesday" is a URL that can be bookmarked or sent to a colleague.

The grid draws **coverage and bookings as separate layers**, which is the one place it
departs from how most practice-management schedulers look. A scheduler that only draws
appointments renders two very different states identically: a clinician on shift with a
free afternoon, and no clinician at all. Those are opposite answers to "can we fit someone
in", so here the rostered band is the background and appointments sit on top of it. An
empty white column is capacity; an empty grey column is nobody.

Consequences of modelling it that way:

- **Shifts are keyed by (clinician, facility, weekday)**, not by clinician. One clinician
  covering two sites on different days is the normal case in group practice, and a roster
  keyed by clinician alone cannot express it. Facility membership *is* the shift — there is
  no separate join table to fall out of sync.
- **Breaks and unavailable blocks are drawn as hatching, not a flat fill.** A solid grey
  block reads as "something is booked here", which is the opposite of what it means.
- **Conflicts are computed server-side**, not inferred by the grid. Double-booking, a
  booking over a break, and a booking outside rostered hours are operational defects the
  schedule *has*; the UI only reports them. Overlapping appointments are then packed into
  side-by-side lanes per cluster, so a clash at 09:00 does not halve the width of every
  appointment in the day.
- **Cancelled slots stay visible and are excluded from utilisation.** The time is free
  again, and removing the block would hide that anything was ever there.

## Audit

Blueprint §19 requires every clinical state change to be attributable and immutable, so the
audit sink was built before the first write path rather than after it.

`AuditService` exposes `append`, `find`, and `findForSubject` — there is no update and no
delete, and every stored event is frozen, including its actor and its changes. A test
asserts that method surface, because the guarantee is the *absence* of an API and absences
are easy to erode. Corrections are new events that reference the ones they correct; the
record of what was believed at the time survives them.

Events are written by the module performing the action, inside the same operation, so an
assignment cannot succeed while its audit entry silently fails.

The database enforces the same shape independently: `audit_events` has no `UPDATE` or
`DELETE` grant *and* a trigger that refuses both, so immutability survives a compromised
application role rather than depending on `AuditService` alone.

**Attribution is still incomplete** — see [Security](#security).

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

## Running a trial

Enough to create a clinic, invite staff, and use the system. Everything survives a restart —
see the warning at the end of this section.

**1. Start the API and the clinical app** in two terminals:

```bash
pnpm --filter @nexuvi/core-api dev
```

```bash
pnpm --filter @nexuvi/clinical-web dev
```

**2. Create a clinic:**

```bash
pnpm --filter @nexuvi/core-api provision \
  --name "Bo Children's Clinic" --slug bo-childrens \
  --admin-email lead@bochildrens.sl --admin-name "Dr. Sia Momoh" \
  --city Bo
```

It prints the administrator's setup link. **That link is shown once** — nothing stores the
plaintext token, so it cannot be recovered afterwards.

**3. Point the clinical app at the new clinic.** Staff surfaces are per-clinic hostnames
(`{slug}.app.nexuvi.health`); locally there is no DNS, so pin one:

```bash
STAFF_HOST=bo-childrens.app.nexuvi.health pnpm --filter @nexuvi/clinical-web dev
```

**4. Open the setup link** at `http://localhost:3000/setup?invite=…`. Set a password, brand
the portal, publish.

**5. Add staff** from **Staff** in the sidebar. Each invitation produces a link to send —
also shown once.

**6. They sign in** at `http://localhost:3000/sign-in` with the password they chose.

For the patient portal, run it with the matching *patient* host (no `.app`):

```bash
PORTAL_HOST=bo-childrens.nexuvi.health pnpm --filter @nexuvi/patient-portal dev
```

### Putting the trial on a real domain

`scripts/tunnel/` runs the three dev servers behind a Cloudflare Tunnel, so
`{clinic}.yourdomain` and `{clinic}.app.yourdomain` reach your laptop over real HTTPS.
Nothing is deployed — hot reload and the snapshot keep working. The tunnel is free; you
pay only for the domain (~$10–20/yr).

```bash
PLATFORM_DOMAIN=example.com pnpm trial
```

`PLATFORM_DOMAIN` is the only thing that changes when the platform moves domain — hostname
parsing, provisioning, and every generated URL read it.

**`DEV_TOKEN_SECRET` becomes mandatory.** `/api/auth/dev-token` mints a platform-operator
token — the authority to create customers. That is a convenience on localhost and an open
door on any reachable URL, so the endpoint requires this secret from every non-local caller
and closes itself if none is set. `pnpm trial` generates one per run and prints the
provisioning command with it.

### Trial persistence, and its limits

Under `DATA_DRIVER=memory` the stores are written to a JSON snapshot
(`services/core-api/.nexuvi/trial-data.json`, path logged at boot) so a trial survives a
restart. It is rewritten atomically and holds no plaintext credentials — invitation tokens
are hashed, passwords are scrypt digests.

**It is not a database.** No transactions, no concurrent-writer safety, and no row-level
security — which is the second layer of tenant isolation a production deployment is
required to have (§17.3). It is refused outright when `NODE_ENV=production`.

**Do not put real patient data in it.** Use synthetic data for the trial; Postgres is the
production path and its migrations are already written.

## Getting started

Requires Node 22+ and Corepack (bundled with Node).

```bash
corepack enable pnpm && pnpm install
```

Run the API and the workspace in two terminals:

```bash
pnpm --filter @nexuvi/core-api dev
```

```bash
pnpm --filter @nexuvi/clinical-web dev
```

The workspace is at `http://localhost:3000`, the API at `http://localhost:3001/api`.
No database is required — see [Data drivers](#data-drivers).

Checks:

```bash
pnpm typecheck && pnpm test
```

## Data drivers

`DATA_DRIVER` selects how the API reads:

| Value | Behaviour |
| --- | --- |
| `memory` (default in development) | Read models come from a seeded fixture. The tenant and auth modules are not loaded, because they need a live connection. |
| `postgres` | TypeORM connects using the `DB_*` environment variables and every module loads. |

`memory` exists so the API and front end can be built before a Postgres country cell is
provisioned. It is not a silent fallback: the choice is logged at boot, and the API
**refuses to start** with `DATA_DRIVER=memory` when `NODE_ENV=production` rather than
serve invented figures to clinicians.

The front end takes the same position. If the API is unreachable, the dashboard renders an
explicit "live data unavailable" state — never placeholder numbers, which a reader cannot
distinguish from real ones.

## Ground rules

These are enforced by code and tests, not style guides:

- **Tenant isolation at both layers.** The application scopes every read to the caller's
  tenant, and RLS enforces the same boundary in the database (§17.3). The application-layer
  negative tests pass today; the database-layer ones need a live Postgres. See
  [Multi-tenancy](#multi-tenancy).

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

## Configuration

Every environment variable is declared and validated once, at boot, in
`infrastructure/config`. Problems are collected and reported together, so a deployment is
not fixed one variable per restart, and anything unsafe outside development is *refused*
rather than warned about — a service that boots with a development JWT secret in production
quietly accepts forged tokens.

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | |
| `PORT` | `3001` | |
| `DATA_DRIVER` | `memory` | Refused in production. |
| `AUTH_MODE` | `dev` outside prod | `dev` refused in production. |
| `JWT_SECRET` | dev default | Refused in production if unchanged. |
| `AUTH_JWKS_URI` | — | Required when `AUTH_MODE=jwks`. |
| `CORS_ORIGINS` | localhost:3000 | `*` refused everywhere; http refused in production. |
| `DB_*` | localhost/nexuvi | `DB_PASSWORD` required in production. |
| `LOG_LEVEL` | `debug` / `info` | |

## Local environment

Blueprint §2.1 specifies Docker Compose for PostgreSQL, Redis, LocalStack (S3/SQS),
Mailpit, and a local identity-provider mode. **No container runtime is installed on this
machine yet** — install Docker Desktop, Colima, or OrbStack before switching to
`DATA_DRIVER=postgres`.

Until then the `memory` driver covers the read paths. Write paths are deliberately not
built yet: every clinical state transition has to be attributable and immutable under §19,
so they land with the audit sink rather than before it.

## Confidential

Product and technical planning material. Not for distribution.
