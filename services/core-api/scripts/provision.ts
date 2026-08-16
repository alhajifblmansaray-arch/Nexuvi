/**
 * Provision a clinic from the command line.
 *
 * The trial path. Onboarding a customer is a platform action, and until there is a
 * platform console this is the interface for it — a script beats hand-written `curl`
 * because it validates before it calls, and because it prints the one thing that cannot be
 * retrieved later: the administrator's setup link.
 *
 *   pnpm --filter @nexuvi/core-api provision \
 *     --name "Bo Children's Clinic" --slug bo-childrens \
 *     --admin-email lead@bochildrens.sl --admin-name "Dr. Sia Momoh" \
 *     --city Bo
 *
 * Talks to the running API rather than importing the stores directly, so it exercises
 * exactly the same authorisation, validation, and audit path a console would.
 */

const API = process.env.NEXUVI_API ?? 'http://localhost:3001/api';

interface Args {
  readonly [key: string]: string | undefined;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const required = ['name', 'slug', 'admin-email', 'admin-name', 'city'];
  const missing = required.filter((key) => !args[key]);
  if (missing.length > 0 || args.help === 'true') {
    process.stdout.write(
      `Provision a clinic.\n\n` +
        `Required:\n` +
        `  --name          Legal name, e.g. "Bo Children's Clinic"\n` +
        `  --slug          URL label, e.g. bo-childrens  (permanent — it ends up in patient bookmarks)\n` +
        `  --admin-email   First administrator's email\n` +
        `  --admin-name    First administrator's name\n` +
        `  --city          City of the first site\n\n` +
        `Optional:\n` +
        `  --template      primary-care | hospital | dental | pharmacy   (default primary-care)\n` +
        `  --plan          essentials | practice | enterprise            (default practice)\n` +
        `  --cell          Country cell                                  (default cell_sl)\n` +
        `  --timezone      IANA zone                                     (default Africa/Freetown)\n` +
        (missing.length > 0 ? `\nMissing: ${missing.join(', ')}\n` : ''),
    );
    process.exit(missing.length > 0 ? 2 : 0);
  }

  // A platform operator token. When a real console exists this is the signed-in operator.
  const tokenResponse = await fetch(`${API}/auth/dev-token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Required by the API for any caller that is not on localhost — a hosted instance
      // will refuse without it.
      ...(process.env.DEV_TOKEN_SECRET
        ? { 'x-nexuvi-dev-secret': process.env.DEV_TOKEN_SECRET }
        : {}),
    },
    body: JSON.stringify({ persona: 'platformOperator' }),
  });
  if (!tokenResponse.ok) {
    fail(`Could not obtain a platform token (HTTP ${tokenResponse.status}). Is the API running?`);
  }
  const { token } = (await tokenResponse.json()) as { token: string };

  const slug = args.slug!;

  // Checked before creating, because a slug is effectively permanent.
  const availability = await fetch(
    `${API}/platform/slug-availability?slug=${encodeURIComponent(slug)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const check = (await availability.json()) as { available: boolean; reason?: string; suggestion?: string };
  if (!check.available) {
    fail(`Cannot use "${slug}": ${check.reason}${check.suggestion ? ` Try "${check.suggestion}".` : ''}`);
  }

  const response = await fetch(`${API}/platform/tenants`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      legalName: args.name,
      slug,
      countryCellId: args.cell ?? 'cell_sl',
      template: args.template ?? 'primary-care',
      plan: args.plan ?? 'practice',
      adminEmail: args['admin-email'],
      adminName: args['admin-name'],
      facilityName: args['facility-name'] ?? args.name,
      city: args.city,
      timezone: args.timezone ?? 'Africa/Freetown',
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    fail((body as { detail?: string }).detail ?? `Provisioning failed (HTTP ${response.status}).`);
  }

  const result = body as {
    tenantId: string;
    slug: string;
    portalUrl: string;
    setupUrl: string;
    inviteExpiresAt: string;
    plan: string;
    template: string;
    seeded: { departments: number; appointmentTypes: number; roles: number; modules: string[] };
  };

  const local = new URL(result.setupUrl);

  process.stdout.write(
    `\n  ${args.name} is ready.\n\n` +
      `  Tenant      ${result.tenantId}\n` +
      `  Plan        ${result.plan} · ${result.template}\n` +
      `  Seeded      ${result.seeded.departments} departments, ` +
      `${result.seeded.appointmentTypes} appointment types, ${result.seeded.roles} roles\n` +
      `  Modules     ${result.seeded.modules.join(', ')}\n\n` +
      `  Send this to ${args['admin-name']} — it is shown once and cannot be recovered:\n\n` +
      `    ${result.setupUrl}\n\n` +
      `  Locally, with STAFF_HOST=${local.host} on the clinical app:\n\n` +
      `    http://localhost:3000${local.pathname}${local.search}\n\n` +
      `  Expires     ${new Date(result.inviteExpiresAt).toLocaleString()}\n` +
      (result.portalUrl ? `  Patients    ${result.portalUrl} (after they publish)\n` : '') +
      `\n`,
  );
}

function fail(message: string): never {
  process.stderr.write(`\n  ${message}\n\n`);
  process.exit(1);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
