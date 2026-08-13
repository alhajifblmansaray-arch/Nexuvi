/**
 * Generates `specimen.html` from the live token modules.
 *
 * The specimen is generated rather than hand-written so it cannot drift from the tokens it
 * documents. If a swatch on the page is wrong, the token is wrong — there is no third
 * place for the value to be stored and go stale.
 *
 * Run: pnpm --filter @nexuvi/design-system specimen
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { primitives } from '../src/tokens/primitives.ts';
import {
  SEMANTIC_COLOR_TOKENS,
  cssVarName,
  darkTheme,
  lightTheme,
  type SemanticColorToken,
} from '../src/tokens/semantic.ts';
import { toCssCustomProperties } from '../src/theming/emit.ts';
import { resolveTenantTheme } from '../src/theming/tenant-theme.ts';

const { color, radius, shadow, fontSize, space } = primitives;

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function rampRow(name: string, ramp: Record<string, string>): string {
  const steps = Object.entries(ramp)
    .map(
      ([step, value]) => `
        <div class="step">
          <div class="chip" style="background:${value}"></div>
          <span class="step-n">${step}</span>
          <span class="step-v">${value}</span>
        </div>`,
    )
    .join('');
  return `<div class="ramp"><h3>${escape(name)}</h3><div class="steps">${steps}</div></div>`;
}

/** Group semantic tokens by their prefix so the page reads as a system, not a list. */
function semanticGroups(): Array<{ title: string; note: string; tokens: SemanticColorToken[] }> {
  const by = (prefix: string) =>
    SEMANTIC_COLOR_TOKENS.filter((t) => t.startsWith(prefix)) as SemanticColorToken[];
  return [
    { title: 'Surface', note: 'Grounds, from page to overlay.', tokens: by('surface') },
    { title: 'Text', note: 'Foregrounds. Every one clears AA on its intended ground.', tokens: by('text') },
    { title: 'Border', note: 'Separation and focus.', tokens: by('border') },
    {
      title: 'Action',
      note: 'Tenant-overridable. A clinic’s brand colour lands here.',
      tokens: by('action'),
    },
    {
      title: 'Status',
      note: 'Generic interface state. Also tenant-overridable (§3.3).',
      tokens: by('status'),
    },
    {
      title: 'Clinical',
      note: 'Locked platform-wide. No tenant configuration reaches these (§19.1).',
      tokens: by('clinical'),
    },
    {
      title: 'Platform',
      note: 'Locked. Offline and support-session state must read identically in every tenant.',
      tokens: by('platform'),
    },
  ];
}

function semanticSection(): string {
  return semanticGroups()
    .map(
      (group) => `
      <div class="tok-group">
        <div class="tok-head">
          <h3>${escape(group.title)}</h3>
          <p>${group.note}</p>
        </div>
        <div class="tok-grid">
          ${group.tokens
            .map(
              (token) => `
            <div class="tok">
              <span class="tok-sw" style="background:var(${cssVarName(token)})"></span>
              <code>${escape(token)}</code>
            </div>`,
            )
            .join('')}
        </div>
      </div>`,
    )
    .join('');
}

function scaleSection(): string {
  const radii = Object.entries(radius)
    .filter(([key]) => key !== 'none')
    .map(
      ([key, value]) => `
      <div class="scale-item">
        <div class="radius-demo" style="border-radius:${value}"></div>
        <code>${escape(key)}</code><span>${escape(value)}</span>
      </div>`,
    )
    .join('');

  const shadows = Object.entries(shadow)
    .map(
      ([key, value]) => `
      <div class="scale-item">
        <div class="shadow-demo" style="box-shadow:${value}"></div>
        <code>${escape(key)}</code>
      </div>`,
    )
    .join('');

  return `
    <div class="scale-block">
      <h3>Corner radius</h3>
      <p class="muted">Cards sit at <code>lg</code>, controls at <code>md</code>, chips at <code>full</code>. <code>sm</code> exists for elements that tile edge-to-edge — table cells, calendar slots — where a large radius leaves visible gaps instead of a soft edge.</p>
      <div class="scale-row">${radii}</div>
    </div>
    <div class="scale-block">
      <h3>Elevation</h3>
      <p class="muted">Wide and faint rather than tight and dark. A tight shadow reads as a hard edge.</p>
      <div class="scale-row">${shadows}</div>
    </div>`;
}

function tenantBlock(
  id: string,
  name: string,
  brand: string,
  domain: string,
): { css: string; html: string } {
  const resolved = resolveTenantTheme({ primary: brand });

  if (!resolved.ok) {
    const issue = resolved.issues[0]!;
    return {
      css: '',
      html: `
      <div class="tenant rejected">
        <div class="tenant-head">
          <span class="tenant-swatch" style="background:${brand}"></span>
          <div>
            <strong>${escape(name)}</strong>
            <span class="muted">${escape(domain)}</span>
          </div>
          <span class="pill pill-danger">Rejected</span>
        </div>
        <p class="reject-msg">${escape(issue.message)}</p>
        <dl class="reject-meta">
          <div><dt>Submitted</dt><dd><code>${escape(brand)}</code></dd></div>
          <div><dt>Contrast</dt><dd>${issue.actualRatio}:1 <span class="muted">need ${issue.requiredRatio}:1</span></dd></div>
          <div><dt>Nearest that passes</dt><dd><code>${escape(issue.suggestion ?? '—')}</code></dd></div>
        </dl>
      </div>`,
    };
  }

  const css = `
[data-tenant="${id}"] {
${toCssCustomProperties(resolved.light)}
}
:root[data-theme="dark"] [data-tenant="${id}"] {
${toCssCustomProperties(resolved.dark)}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) [data-tenant="${id}"] {
${toCssCustomProperties(resolved.dark)}
  }
}`;

  const html = `
      <div class="tenant" data-tenant="${id}">
        <div class="tenant-head">
          <span class="tenant-swatch" style="background:${brand}"></span>
          <div>
            <strong>${escape(name)}</strong>
            <span class="muted">${escape(domain)}</span>
          </div>
          <span class="pill pill-ok">Accepted</span>
        </div>
        <div class="tenant-body">
          <button class="btn btn-primary" type="button">Book appointment</button>
          <button class="btn btn-ghost" type="button">Cancel</button>
        </div>
        <div class="tenant-foot">
          <span class="pill pill-selected">Selected</span>
          <a href="#tenancy">A link in tenant colour</a>
        </div>
        <div class="tenant-locked">
          <span class="alert-dot"></span>
          Allergy: penicillin — locked colour, unchanged by tenant brand
        </div>
      </div>`;

  return { css, html };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const tenants = [
  tenantBlock('freetown', 'Freetown Family Clinic', '#1a5147', 'care.freetownfamily.sl'),
  tenantBlock('salone', 'Salone Physio Group', '#2f4f7a', 'salonephysio.nexuvi.health'),
  tenantBlock('goldleaf', 'Goldleaf Wellness', '#f2cb85', 'goldleaf.nexuvi.health'),
];

const html = `<title>Nexuvi Design System — Token Specimen</title>
<style>
:root {
${toCssCustomProperties(lightTheme)}
  --font-sans: ${primitives.fontFamily.sans};
  --font-mono: ${primitives.fontFamily.mono};
  --r-sm: ${radius.sm};
  --r-md: ${radius.md};
  --r-lg: ${radius.lg};
  --r-xl: ${radius.xl};
  --r-2xl: ${radius['2xl']};
  --r-full: ${radius.full};
  --sh-xs: ${shadow.xs};
  --sh-sm: ${shadow.sm};
  --sh-md: ${shadow.md};
  --sh-lg: ${shadow.lg};
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${toCssCustomProperties(darkTheme)}
  }
}
:root[data-theme="dark"] {
${toCssCustomProperties(darkTheme)}
}
:root[data-theme="light"] {
${toCssCustomProperties(lightTheme)}
}
${tenants.map((t) => t.css).join('\n')}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: ${fontSize.md};
  line-height: ${primitives.lineHeight.normal};
  color: var(--nx-color-text-primary);
  background: var(--nx-color-surface-page);
  -webkit-font-smoothing: antialiased;
}

.wrap {
  max-width: 1080px;
  margin: 0 auto;
  padding: ${space[12]} ${space[6]} ${space[24]};
  display: flex;
  flex-direction: column;
  gap: ${space[16]};
}

h1, h2, h3 { text-wrap: balance; margin: 0; letter-spacing: -0.011em; }
h1 { font-size: ${fontSize['3xl']}; font-weight: ${primitives.fontWeight.semibold}; }
h2 { font-size: ${fontSize.xl}; font-weight: ${primitives.fontWeight.semibold}; }
h3 { font-size: ${fontSize.md}; font-weight: ${primitives.fontWeight.semibold}; }
p { margin: 0; }
code { font-family: var(--font-mono); font-size: 0.86em; }
a { color: var(--nx-color-text-link); text-underline-offset: 3px; }

.muted { color: var(--nx-color-text-muted); font-size: ${fontSize.base}; }

.masthead { display: flex; flex-direction: column; gap: ${space[3]}; }
.eyebrow {
  font-size: ${fontSize.xs};
  text-transform: uppercase;
  letter-spacing: 0.09em;
  font-weight: ${primitives.fontWeight.semibold};
  color: var(--nx-color-text-muted);
}
.lede { max-width: 62ch; color: var(--nx-color-text-secondary); }

.status-strip {
  display: flex; flex-wrap: wrap; gap: ${space[2]};
  margin-top: ${space[2]};
}

section { display: flex; flex-direction: column; gap: ${space[5]}; }
.sec-head { display: flex; flex-direction: column; gap: ${space[2]}; }
.sec-head p { max-width: 64ch; color: var(--nx-color-text-secondary); font-size: ${fontSize.base}; }

.card {
  background: var(--nx-color-surface-raised);
  border: 1px solid var(--nx-color-border-subtle);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-xs);
  padding: ${space[6]};
}

/* Ramps */
.ramps { display: flex; flex-direction: column; gap: ${space[5]}; }
.ramp h3 { margin-bottom: ${space[3]}; }
.steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); gap: ${space[2]}; }
.step { display: flex; flex-direction: column; gap: 4px; }
.chip { height: 46px; border-radius: var(--r-md); border: 1px solid var(--nx-color-border-subtle); }
.step-n { font-size: ${fontSize.xs}; font-weight: ${primitives.fontWeight.medium}; }
.step-v { font-size: ${fontSize.xs}; color: var(--nx-color-text-muted); font-family: var(--font-mono); }

/* Semantic tokens */
.tok-group { display: flex; flex-direction: column; gap: ${space[3]}; }
.tok-head { display: flex; flex-direction: column; gap: 2px; }
.tok-head p { font-size: ${fontSize.base}; color: var(--nx-color-text-muted); }
.tok-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: ${space[2]}; }
.tok {
  display: flex; align-items: center; gap: ${space[3]};
  padding: ${space[2]} ${space[3]};
  border: 1px solid var(--nx-color-border-subtle);
  border-radius: var(--r-md);
  background: var(--nx-color-surface-raised);
}
.tok-sw {
  width: 22px; height: 22px; flex: none;
  border-radius: var(--r-sm);
  border: 1px solid var(--nx-color-border-subtle);
}

/* Scales */
.scale-block { display: flex; flex-direction: column; gap: ${space[3]}; }
.scale-block p { max-width: 66ch; }
.scale-row { display: flex; flex-wrap: wrap; gap: ${space[5]}; }
.scale-item { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.scale-item span { font-size: ${fontSize.xs}; color: var(--nx-color-text-muted); }
.radius-demo {
  width: 76px; height: 76px;
  background: var(--nx-color-action-primary-subtle);
  border: 1px solid var(--nx-color-border-default);
}
.shadow-demo {
  width: 76px; height: 76px;
  border-radius: var(--r-lg);
  background: var(--nx-color-surface-raised);
  border: 1px solid var(--nx-color-border-subtle);
}

/* Controls */
.btn {
  font: inherit;
  font-size: ${fontSize.base};
  font-weight: ${primitives.fontWeight.medium};
  padding: ${space[2]} ${space[4]};
  border-radius: var(--r-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background ${primitives.duration.fast} ${primitives.easing.standard};
}
.btn:focus-visible {
  outline: 2px solid var(--nx-color-border-focus);
  outline-offset: 2px;
}
.btn-primary { background: var(--nx-color-action-primary); color: var(--nx-color-text-on-action); }
.btn-primary:hover { background: var(--nx-color-action-primary-hover); }
.btn-ghost {
  background: transparent;
  color: var(--nx-color-text-secondary);
  border-color: var(--nx-color-border-default);
}
.btn-ghost:hover { background: var(--nx-color-surface-hover); }
.btn-danger { background: var(--nx-color-status-danger); color: var(--nx-color-text-on-status); }

.pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: ${fontSize.xs};
  font-weight: ${primitives.fontWeight.medium};
  padding: 3px ${space[3]};
  border-radius: var(--r-full);
  white-space: nowrap;
}
.pill-ok { background: var(--nx-color-status-success-subtle); color: var(--nx-color-status-success); }
.pill-warn { background: var(--nx-color-status-warning-subtle); color: var(--nx-color-status-warning); }
.pill-danger { background: var(--nx-color-status-danger-subtle); color: var(--nx-color-status-danger); }
.pill-info { background: var(--nx-color-status-info-subtle); color: var(--nx-color-status-info); }
.pill-crit { background: var(--nx-color-clinical-critical-subtle); color: var(--nx-color-clinical-critical); }
.pill-selected { background: var(--nx-color-surface-selected); color: var(--nx-color-text-link); }
.pill-offline { background: var(--nx-color-surface-sunken); color: var(--nx-color-platform-offline); }

.control-row { display: flex; flex-wrap: wrap; gap: ${space[3]}; align-items: center; }

/* Applied sample */
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: ${space[3]}; }
.stat { display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: ${fontSize.xs}; color: var(--nx-color-text-muted); text-transform: uppercase; letter-spacing: 0.07em; }
.stat-value { font-size: ${fontSize['2xl']}; font-weight: ${primitives.fontWeight.semibold}; font-variant-numeric: tabular-nums; }
.stat-delta { font-size: ${fontSize.xs}; color: var(--nx-color-text-muted); }

.banner {
  display: flex; align-items: flex-start; gap: ${space[3]};
  padding: ${space[4]};
  border-radius: var(--r-lg);
  background: var(--nx-color-clinical-allergy-subtle);
  border: 1px solid var(--nx-color-clinical-allergy);
}
.banner strong { color: var(--nx-color-clinical-allergy); }
.banner p { font-size: ${fontSize.base}; color: var(--nx-color-text-secondary); }
.alert-dot {
  width: 9px; height: 9px; border-radius: var(--r-full); flex: none;
  background: var(--nx-color-clinical-allergy);
  margin-top: 7px;
}

.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: ${fontSize.base}; min-width: 620px; }
th {
  text-align: left; font-weight: ${primitives.fontWeight.medium};
  font-size: ${fontSize.xs}; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--nx-color-text-muted);
  padding: 0 ${space[3]} ${space[2]};
  border-bottom: 1px solid var(--nx-color-border-default);
}
td {
  padding: ${space[3]};
  border-bottom: 1px solid var(--nx-color-border-subtle);
  font-variant-numeric: tabular-nums;
}
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover td { background: var(--nx-color-surface-hover); }
td:first-child { font-family: var(--font-mono); font-size: ${fontSize.sm}; }

/* Tenancy */
.tenants { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: ${space[4]}; }
.tenant {
  display: flex; flex-direction: column; gap: ${space[4]};
  padding: ${space[5]};
  border-radius: var(--r-lg);
  border: 1px solid var(--nx-color-border-subtle);
  background: var(--nx-color-surface-raised);
  box-shadow: var(--sh-xs);
}
.tenant-head { display: flex; align-items: center; gap: ${space[3]}; }
.tenant-head > div { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.tenant-head strong { font-size: ${fontSize.base}; }
.tenant-head .muted { font-size: ${fontSize.xs}; font-family: var(--font-mono); }
.tenant-swatch {
  width: 30px; height: 30px; flex: none;
  border-radius: var(--r-md);
  border: 1px solid var(--nx-color-border-default);
}
.tenant-body { display: flex; gap: ${space[2]}; }
.tenant-foot { display: flex; align-items: center; gap: ${space[3]}; font-size: ${fontSize.base}; }
.tenant-locked {
  display: flex; align-items: flex-start; gap: ${space[2]};
  font-size: ${fontSize.xs};
  color: var(--nx-color-clinical-allergy);
  background: var(--nx-color-clinical-allergy-subtle);
  padding: ${space[2]} ${space[3]};
  border-radius: var(--r-md);
}
.rejected .reject-msg { font-size: ${fontSize.base}; color: var(--nx-color-text-secondary); }
.reject-meta { display: flex; flex-direction: column; gap: ${space[2]}; margin: 0; }
.reject-meta > div { display: flex; justify-content: space-between; gap: ${space[3]}; font-size: ${fontSize.sm}; }
.reject-meta dt { color: var(--nx-color-text-muted); }
.reject-meta dd { margin: 0; }

footer {
  font-size: ${fontSize.base};
  color: var(--nx-color-text-muted);
  border-top: 1px solid var(--nx-color-border-subtle);
  padding-top: ${space[5]};
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
</style>

<div class="wrap">
  <header class="masthead">
    <span class="eyebrow">Nexuvi &middot; Design system</span>
    <h1>Token specimen</h1>
    <p class="lede">Every value on this page is read from the token modules at build time. Monochrome ground, colour rationed to the things that carry meaning. Generated ${new Date().toISOString().slice(0, 10)}.</p>
    <div class="status-strip">
      <span class="pill pill-ok">${SEMANTIC_COLOR_TOKENS.length} semantic tokens</span>
      <span class="pill pill-info">Light &amp; dark</span>
      <span class="pill pill-warn">Logo &amp; typeface pending</span>
    </div>
  </header>

  <section>
    <div class="sec-head">
      <h2>Foundations</h2>
      <p>The neutral ramp is the brand. There is no Nexuvi hue in the action layer &mdash; &sect;3.3 gives every clinic its own brand colour, so a strong platform hue in that slot would either fight the tenant&rsquo;s branding or be overwritten by it.</p>
    </div>
    <div class="card ramps">
      ${rampRow('Neutral — the brand', color.neutral)}
      ${rampRow('Accent — selection, links, focus, info', color.accent)}
      ${rampRow('Mint — success', color.mint)}
      ${rampRow('Amber — warning', color.amber)}
      ${rampRow('Rose — danger (generic UI)', color.rose)}
      ${rampRow('Coral — clinical alert (locked)', color.clinicalAlert)}
    </div>
  </section>

  <section>
    <div class="sec-head">
      <h2>Semantic tokens</h2>
      <p>Components reference only this layer. A component naming a primitive directly has hardcoded a decision that both tenant theming and dark mode need to be able to change.</p>
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:${space[6]}">
      ${semanticSection()}
    </div>
  </section>

  <section>
    <div class="sec-head">
      <h2>Shape and elevation</h2>
      <p>This is most of where &ldquo;softer&rdquo; lives.</p>
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:${space[8]}">
      ${scaleSection()}
    </div>
  </section>

  <section>
    <div class="sec-head">
      <h2>In use</h2>
      <p>A clinical worklist, assembled from the tokens above. Note how little colour is present until something needs attention.</p>
    </div>

    <div class="card" style="display:flex;flex-direction:column;gap:${space[6]}">
      <div class="stats">
        <div class="stat">
          <span class="stat-label">Awaiting acknowledgement</span>
          <span class="stat-value">14</span>
          <span class="stat-delta">3 added in the last hour</span>
        </div>
        <div class="stat">
          <span class="stat-label">Patients checked in</span>
          <span class="stat-value">68</span>
          <span class="stat-delta">Across 4 clinics</span>
        </div>
        <div class="stat">
          <span class="stat-label">Prescriptions to verify</span>
          <span class="stat-value">23</span>
          <span class="stat-delta">Median wait 11 min</span>
        </div>
        <div class="stat">
          <span class="stat-label">Queued for DHIS2</span>
          <span class="stat-value">1,204</span>
          <span class="stat-delta">Last submission 06:15</span>
        </div>
      </div>

      <div class="banner">
        <span class="alert-dot"></span>
        <div>
          <strong>Allergy — penicillin, anaphylaxis</strong>
          <p>Recorded 12 Mar 2026 by Dr A. Kamara. This colour is locked platform-wide and cannot be changed by tenant branding.</p>
        </div>
      </div>

      <div class="control-row">
        <button class="btn btn-primary" type="button">Acknowledge result</button>
        <button class="btn btn-ghost" type="button">Assign to colleague</button>
        <button class="btn btn-danger" type="button">Cancel order</button>
        <span class="pill pill-offline">&#9679; Working offline &mdash; 6 queued</span>
      </div>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Patient</th>
              <th scope="col">Test</th>
              <th scope="col">Waiting</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>LAB-10847</td><td>Aminata Sesay</td><td>Serum potassium</td><td>2h 14m</td>
              <td><span class="pill pill-crit">Critical &mdash; unacknowledged</span></td>
            </tr>
            <tr>
              <td>LAB-10821</td><td>Mohamed Bangura</td><td>Malaria RDT</td><td>1h 02m</td>
              <td><span class="pill pill-warn">Awaiting validation</span></td>
            </tr>
            <tr>
              <td>LAB-10889</td><td>Fatmata Koroma</td><td>Full blood count</td><td>38m</td>
              <td><span class="pill pill-info">In progress</span></td>
            </tr>
            <tr>
              <td>LAB-10903</td><td>Ibrahim Turay</td><td>Blood glucose</td><td>12m</td>
              <td><span class="pill pill-ok">Released</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section id="tenancy">
    <div class="sec-head">
      <h2>The same components, three tenants</h2>
      <p>Each card below is identical markup under a different tenant theme. The clinic&rsquo;s colour reaches the action layer, links, selection, and focus &mdash; and stops there. The allergy strip is the same colour in all three, because it has to be.</p>
    </div>
    <div class="tenants">
      ${tenants.map((t) => t.html).join('')}
    </div>
  </section>

  <footer>
    <p>Generated from <code>packages/design-system/src/tokens</code>. Outstanding before this system is complete: logo and favicon assets, confirmed and self-hosted typeface, component library, and the data-visualisation palette.</p>
  </footer>
</div>
`;

const out = fileURLToPath(new URL('../specimen.html', import.meta.url));
writeFileSync(out, html, 'utf8');
console.log(`Wrote ${out}`);
