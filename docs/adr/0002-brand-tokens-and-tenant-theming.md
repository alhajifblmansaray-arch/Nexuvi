# ADR-0002: Brand tokens and tenant theming

- **Status:** Accepted for colour and shape; typography and brand assets outstanding
- **Date:** 2026-08-13
- **Deciders:** Platform architecture, Design
- **Blueprint refs:** §3.3, §3.5, §4, §30 (Accessibility)

## Context

Nexuvi has its own brand, and §3.3 also requires every tenant to restyle its portal —
logo, favicon, primary/secondary/neutral/success/warning/error colours, login background,
document templates — *within accessibility limits*, and explicitly **without uploading
executable code or arbitrary CSS**. Eleven distinct surfaces (§4) must stay recognisably
one product across all of it.

That combination rules out the usual approaches. A tenant cannot ship a stylesheet. A
tenant cannot be trusted to pick a readable colour. And the Nexuvi brand cannot be so
diluted by tenant overrides that the platform stops looking like one system.

## Decision

A three-layer token system in `packages/design-system`, resolved at runtime as CSS custom
properties:

1. **Primitive tokens** — the raw Nexuvi brand ramps (colour scales, type scale, spacing,
   radii, elevation, motion). Fixed. Not themeable by anyone.
2. **Semantic tokens** — role-based aliases consumed by every component:
   `--nx-color-action`, `--nx-color-surface`, `--nx-color-critical`, `--nx-text-primary`,
   and so on. Components reference *only* these. No component ever names a primitive.
3. **Tenant overrides** — a validated, closed set of semantic tokens a tenant may rebind,
   stored as tenant configuration (§3.5) and emitted as a scoped custom-property block.

Enforcement rules:

- The override set is an allowlist. A token not on it cannot be set, so a tenant can
  restyle its action colour but cannot restyle the critical-alert or allergy-warning
  colours, which carry clinical meaning (§19.1).
- Every submitted colour is contrast-checked against its intended background at save time
  and rejected below WCAG 2.2 AA (§30). Validation happens server-side; the admin UI
  preview is a convenience, not the gate.
- **Tenants supply six base colours, not the full token set.** Hover, active, and subtle
  variants are derived. Asking a clinic administrator to nominate a pressed-state green
  would create forty independent routes to an unreadable interface instead of six.
- **Rejections carry the nearest workable shade.** We do not silently repair a tenant's
  colour — their portal would then not match the brand they configured, with no
  explanation. But a bare contrast ratio is a dead end for the administrator receiving it,
  so each rejection computes and offers the closest passing shade of the same hue. The
  choice stays theirs; it just stops being a guessing game.
- Values are parsed into a structured colour type before storage. Nothing tenant-supplied
  is ever interpolated into a stylesheet as a raw string — that is the CSS-injection path
  §3.3 is closing.
- Required elements — privacy notices, national identifiers, emergency warnings, Nexuvi
  attribution — render from platform tokens outside the tenant scope and cannot be
  overridden or hidden.

## Consequences

- Theming is data, not code. A tenant theme is a validated JSON row, so it can be
  versioned, audited, diffed, and rolled back with the rest of tenant config (§3.5).
- Dark mode and high-contrast mode are additional semantic bindings over the same
  primitives rather than a parallel set of components.
- Components must be reviewed for direct primitive references; an ESLint rule enforcing
  "semantic tokens only" belongs in the Phase 0 lint set.

## Visual direction

Set from supplied reference dashboards: monochrome ground, colour only where it carries
meaning, softer and rounder than the incumbent practice-management software.

The consequential part is that **the neutral ramp is the brand** — there is no Nexuvi hue
in the action layer, and primary actions are near-black. This is partly the look asked
for, but it is mostly structural. §3.3 hands every tenant its own brand colour in exactly
that slot, so a strong platform hue there would either fight the clinic's branding or be
immediately overwritten by it. A neutral platform makes tenant colour the only colour in
the room, which is also what makes clinical signalling legible: when six things on screen
are coloured, none of them are urgent.

The single non-status accent is a soft lavender, chosen because nothing in the clinical
safety palette is violet — an accent highlight can therefore never be misread as a
warning. Clinical alert is a warm coral rather than a second red, which keeps it separable
for the ~8% of male staff with red-green colour vision deficiency.

Corner radius and elevation carry the "softer" requirement: cards at 16px, controls at
10px, chips fully rounded, with wide faint shadows instead of tight dark ones. A 6px step
is retained for elements that tile edge-to-edge — table cells, calendar slots — where a
large radius produces visible gaps rather than a soft edge.

`packages/design-system/specimen.html` is generated from the token modules
(`pnpm --filter @nexuvi/design-system specimen`) so the documentation cannot drift from
the values it documents.

## Open

- **Logo and favicon assets** have not been supplied.
- **Typeface unconfirmed.** The stack currently leads with Inter and falls back to
  system-ui. Whatever is chosen must be self-hosted before launch: §15 offline surfaces
  cannot depend on a font CDN.
- **Data-visualisation palette not yet designed.** Both reference dashboards are
  chart-heavy, and a categorical series palette has requirements the interface palette
  does not — ordered and diverging scales, series separability under colour vision
  deficiency, and legibility at 1px stroke widths. Deferred to the charting work rather
  than guessed at here.
