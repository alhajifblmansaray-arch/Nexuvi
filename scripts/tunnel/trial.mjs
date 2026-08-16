#!/usr/bin/env node
/**
 * Brings the whole trial up: API, staff app, patient portal, and the tunnel.
 *
 * Exists because the four processes need *consistent* environment — the same platform
 * domain and the same dev-token secret — and starting them by hand in four terminals is
 * how they end up disagreeing. A staff app pointed at one domain and an API configured for
 * another fails in a way that looks like a bug rather than a typo.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const domain = process.env.PLATFORM_DOMAIN;
if (!domain) {
  process.stderr.write(
    '\n  PLATFORM_DOMAIN is required.\n\n' +
      '    PLATFORM_DOMAIN=example.com pnpm trial\n\n' +
      '  See scripts/tunnel/README.md to buy a domain and create the tunnel first.\n\n',
  );
  process.exit(2);
}

// Generated per run unless pinned. A secret that changes on restart is fine for a trial
// and better than a memorable one that ends up committed.
const devTokenSecret = process.env.DEV_TOKEN_SECRET ?? randomBytes(32).toString('hex');
const tunnel = process.env.TUNNEL_NAME ?? 'nexuvi-trial';

const shared = {
  ...process.env,
  PLATFORM_DOMAIN: domain,
  DEV_TOKEN_SECRET: devTokenSecret,
  NEXT_PUBLIC_API_URL: 'http://localhost:3001/api',
};

const services = [
  {
    name: 'api',
    command: 'pnpm',
    args: ['--filter', '@nexuvi/core-api', 'dev'],
    env: { CORS_ORIGINS: `https://app.${domain}` },
  },
  // The apps no longer pin a host: real requests arrive on real clinic hostnames through
  // the tunnel, and the resolver reads them.
  { name: 'staff', command: 'pnpm', args: ['--filter', '@nexuvi/clinical-web', 'dev'], env: {} },
  { name: 'portal', command: 'pnpm', args: ['--filter', '@nexuvi/patient-portal', 'dev'], env: {} },
  { name: 'tunnel', command: 'cloudflared', args: ['tunnel', 'run', tunnel], env: {} },
];

const children = [];

for (const service of services) {
  const child = spawn(service.command, service.args, {
    env: { ...shared, ...service.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const prefix = service.name.padEnd(6);
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      for (const line of chunk.split('\n')) {
        if (line.trim()) process.stdout.write(`  ${prefix} │ ${line}\n`);
      }
    });
  }

  child.on('exit', (code) => {
    process.stdout.write(`\n  ${prefix} │ exited (${code})\n`);
    // One dead service makes the trial silently half-working; take the rest down with it.
    shutdown();
  });

  children.push(child);
}

process.stdout.write(
  `\n  Trial starting on ${domain}\n\n` +
    `    Staff      https://{clinic}.app.${domain}\n` +
    `    Patients   https://{clinic}.${domain}\n\n` +
    `  Provision a clinic in another terminal:\n\n` +
    `    DEV_TOKEN_SECRET=${devTokenSecret} \\\n` +
    `      pnpm --filter @nexuvi/core-api provision --name "…" --slug … \\\n` +
    `        --admin-email … --admin-name "…" --city …\n\n`,
);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGINT');
  // The API flushes its snapshot on SIGINT; give it a moment before the process ends.
  setTimeout(() => process.exit(0), 1500);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);
