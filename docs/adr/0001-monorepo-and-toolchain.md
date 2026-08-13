# ADR-0001: Monorepo layout and toolchain

- **Status:** Accepted
- **Date:** 2026-08-13
- **Deciders:** Platform architecture
- **Blueprint refs:** §2.1, §2.2, §2.3, §10.2

## Context

The Master Architecture Blueprint fixes the repository shape (§2.3) and the runtime stack
(§2.2) but does not name a monorepo tool or package manager. Nexuvi will hold five web
apps, four services, and eight shared packages in one tree, and §10.2 requires that module
boundaries be real — a module must not be able to reach into another module's internals.

## Decision

1. **One monorepo** with the directory layout given in blueprint §2.3, created in full up
   front so that later phases land in a place that already exists.
2. **pnpm workspaces** as the package manager, pinned via `packageManager` and provisioned
   through Corepack so every machine and CI runner resolves the same version.
3. **`node-linker=isolated`** in `.npmrc`. Undeclared ("phantom") dependencies fail to
   resolve rather than silently working. This is the install-time half of the §10.2
   boundary rule; the other half is the architecture tests added in Phase 0.
4. **Turborepo** for task orchestration and caching across `build`, `dev`, `lint`,
   `typecheck`, and `test`.
5. **TypeScript strict everywhere**, plus `noUncheckedIndexedAccess` and
   `exactOptionalPropertyTypes`, from `tsconfig.base.json`. In a clinical system an
   `undefined` that the compiler waved through is a patient-safety defect, not a nit.

## Consequences

- Adding a workspace means adding a directory and a `package.json` — no central registry
  to update.
- `node-linker=isolated` will surface missing dependency declarations as install or build
  errors. That is the intended behaviour; fix the declaration, do not loosen the setting.
- Turborepo remote caching is not enabled yet. Revisit when CI wall-clock becomes a
  constraint, and only with a self-hosted or contractually reviewed cache — build outputs
  from a health platform should not sit on an unvetted third party.

## Alternatives considered

- **npm workspaces** — available with no extra install, but its hoisted layout permits
  phantom dependencies, which defeats the boundary enforcement we specifically want.
- **Nx** — richer generators and dependency-graph tooling, at the cost of a heavier
  conceptual footprint for a team that is still small (§28.1). Revisit if the module count
  outgrows Turborepo's simpler model.
- **Polyrepo** — rejected outright. §1.3 requires shared identity, permissions, audit,
  terminology, and design system across every surface; splitting the repo makes those
  shared contracts a versioning problem instead of a compile-time one.
