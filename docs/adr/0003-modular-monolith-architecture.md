# ADR-0003: Modular monolith backend architecture

- **Status:** Proposed
- **Date:** 2026-08-13
- **Deciders:** Platform architecture, backend team
- **Blueprint refs:** §2.2, §10.2, §10.3, §11

## Context

Nexuvi must be the unified operating platform for healthcare delivery (§1). The first
production backend should be one modular monolith plus workers and the separate
interoperability server. This is deliberate, not a limitation (blueprint §10.2).

The team is small (§28.1) and the product is not yet production-scale. Microservices
impose distribution complexity, operational overhead, and cross-service consistency
challenges that slow early-stage development without proportional benefit. The risk is
over-engineering for a problem the product doesn't yet have.

## Decision

1. **One modular monolith** serving the transactional API for all domains: tenant
   administration, clinical records, orders, medication, pharmacy, lab, hospital ops,
   billing, referral, and public health.

2. **Clear domain boundaries enforced at compile time** (§10.2). Each module owns its
   tables and exposes commands, queries, and events. Architecture tests verify that
   modules do not reach into each other's private tables.

3. **Module-to-module communication** through two paths:
   - **Immediate consistency**: in-process function calls for commands and queries
   - **Eventual consistency**: domain events published through a transactional outbox

4. **Separate early-extraction services** (not in the monolith):
   - **Interoperability service** (FHIR R4, DHIS2, partner adapters) — separate because
     it has different data models and release cadence
   - **Worker service** (async jobs, exports, reporting, notifications) — separate because
     long-running jobs should not block the synchronous API
   - **AI gateway** (future) — separate for isolation and independent scaling

5. **Extract a domain to a service only when** (§10.3):
   - The domain needs independent scaling or distinct reliability objective
   - The domain has its own team and release cadence
   - Long-running or failure-prone work threatens core API latency
   - A security/compliance boundary requires process or account isolation
   - A specialized runtime is materially better (e.g., Python ML, Go for performance)
   - Database load cannot be isolated safely within the current cell

## Module structure

```
services/core-api/
  src/
    domain/
      tenant/         # Organization, facility, department, subscription
      auth/           # Users, memberships, RBAC/ABAC, policies
      clinical/       # Encounters, notes, conditions, procedures, care plans
      medication/     # Prescriptions, dispensing, inventory, formulary
      orders/         # Service requests, specimens, results, acknowledgements
      pharmacy/       # Dispensing workflow, preparation, verification
      lab/            # Accessioning, collection, analyzer integration
      hospital/       # ADT, beds, wards, transfers, discharge
      billing/        # Charges, invoices, payments, claims
      referral/       # Referral creation, acceptance, closure
      public_health/  # Surveillance, case definitions, reporting
      shared/         # Terminology, notifications, templates, config
    application/
      commands/       # Command handlers (e.g., IssuePresciption)
      queries/        # Query handlers (e.g., GetPatientChart)
      events/         # Event handlers (e.g., OnPrescriptionIssued)
    infrastructure/
      database/       # TypeORM entities, migrations
      messaging/      # EventBridge, SQS, SNS adapters
      identity/       # Cognito integration
      storage/        # S3, pre-signed URLs
    api/
      rest/           # REST endpoint definitions (OpenAPI)
      middleware/     # Auth, tenancy, audit, error handling
```

## Module rules

1. **Private tables**: a module owns certain tables (`prescription`, `dispensing`,
   `medication_administration`) and no other module reads or writes them directly.
   If another module needs that data, the owning module provides a query or event.

2. **Cross-module queries**: allowed for immediate consistency. Example: `MedicationModule`
   queries `PharmacyModule.getFormulary()` to validate a prescription. The call is
   synchronous and returns immediately. Dependency is explicit in code.

3. **Cross-module commands**: go through the event bus. Example: `OrderModule` publishes
   `OrderPlaced`, and `PharmacyModule` listens and creates a work item. No direct
   function call. Decouples the domains and enables them to fail independently.

4. **Transactional outbox** (§13.1): domain commands write state and an event record
   in the same database transaction. A separate publisher sends the event. Consumers
   process idempotently and checkpoint. Guarantees "write then notify" semantics
   without distributed transactions.

5. **Architecture tests** enforce the boundaries:
   ```typescript
   it('Medication module does not access Hospital module tables', () => {
     // Scan the transpiled JS for imports like 'hospital.entities.Patient'
     // Fail if found
   })
   ```

## Consequences

- **Fast iteration**: small team, changes are local or explicit through events
- **Deployments are simpler**: one artifact, one deployment, one version
- **Testing is easier**: spin up the whole backend for integration tests
- **Consistency is stronger**: cross-domain commands run in a transaction
- **Later extraction is possible**: module boundaries are real, so splitting is low-risk
- **We won't extract microservices prematurely**: the forcing function is real pain
  (performance, reliability, team structure), not premature optimization

## Tradeoffs

- **Scaling is monolithic**: if one domain is hot (e.g., pharmacy under load), we scale
  the whole backend. This is acceptable until domain load becomes measurably
  unbalanced. Monitoring tracks which domains are hot (§22).

- **Shared failure domain**: if one module has a memory leak or deadlocks the database,
  the whole API goes down. Mitigated by careful database connection pooling (PgBouncer),
  memory limits in containers, and observability (§22) that surfaces the culprit.

- **Deployment coordination**: if the orders module and pharmacy module are both in
  active development, they ship together. Mitigated by feature flags (§21.3) that
  decouple deployment from release.

## Staying modular

The architecture test suite must pass before every merge. Any module that reaches into
another module's private tables is a test failure, not a style preference. This is
non-negotiable.

When a domain needs external state, the module owning that state is explicitly added
as a dependency. Circular dependencies are a build error. Over time, if many modules
depend on one domain, that's a signal to extract it as a service.

## Future: when to extract

- **Pharmacy and billing**: if pharmacy inventory and billing invoices grow to millions
  of rows and account for 60% of database I/O, consider extracting pharmacy as a
  separate service with its own data cell.

- **Notifications**: if push notifications, SMS, and email become a bottleneck (queue
  backlogs, rate-limit exhaustion), extract as a service early. Unlike other domains,
  notifications benefit from independent scaling and can tolerate eventual delivery.

- **Analytics ingestion**: if real-time analytics queries slow the transactional database,
  extract an analytics worker service with a separate read replica or data warehouse.

- **AI gateway**: when AI features are production-critical, a separate service isolates
  model inference, tool calls, and prompt injection risk from core API.

See §10.3 for the full extraction criteria.
