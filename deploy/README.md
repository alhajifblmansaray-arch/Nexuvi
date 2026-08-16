# Deploying the trial

A single VPS running four processes: the API, the two Next apps, and nginx in front of them.
nginx is the only thing the internet can reach.

> **This is a trial deployment.** It serves seeded fixture data from memory and signs its own
> tokens. There is no database, so there are no transactions and no row-level security. It is
> for demonstrations. Real patient data does not go here — that needs `DATA_DRIVER=postgres`
> and `AUTH_MODE=jwks`, which is what `NODE_ENV=production` refuses to boot without.

## How a request finds its clinic

| Hostname | Serves |
| --- | --- |
| `nexuvi.health`, `www`, `app` | Platform surfaces |
| `{slug}-app.nexuvi.health` | Staff workspace |
| `{slug}.nexuvi.health` | Patient portal |
| anything else | Dropped without a response |

Every hostname is exactly **one label** deep, because a wildcard certificate covers one label
and no more. `{slug}.app.nexuvi.health` would need a multi-level wildcard — a paid add-on on
every provider — and without one the TLS handshake fails before a request is ever made.

The API is not routed here at all. Every call to it is made by the Next server from inside
the container, which forwards the browser's `Host` as `X-Forwarded-Host`; that header is how
an anonymous request finds the right branding. Publishing the API would also put
`POST /api/auth/dev-token` on the public internet.

## One-time setup

### 1. DNS

In the Cloudflare dashboard for `nexuvi.health`, under **DNS → Records**, create two records
pointing at the droplet, both **Proxied** (orange cloud):

| Type | Name | Content |
| --- | --- | --- |
| A | `@` | `67.207.94.2` |
| A | `*` | `67.207.94.2` |

The wildcard covers every clinic hostname, so provisioning a clinic never requires a DNS change.

### 2. Origin certificate

Under **SSL/TLS → Origin Server → Create Certificate**, accept the defaults — the hostnames
`*.nexuvi.health, nexuvi.health` are correct — and create it. Cloudflare shows the certificate
and its private key **once**.

On the droplet:

```bash
mkdir -p /root/nexuvi/deploy/ssl && cd /root/nexuvi/deploy/ssl
nano origin.pem   # paste the certificate, save with Ctrl+O then Ctrl+X
nano origin.key   # paste the private key, same
chmod 600 origin.key
```

Paste these into the files on the server directly. The private key is a credential: it does
not belong in chat, in a ticket, or in this repository (`deploy/ssl/` is gitignored).

Then set **SSL/TLS → Overview** to **Full (strict)**. Cloudflare validates the origin
certificate, so traffic is encrypted for its whole path.

### 3. Deployment secret

```bash
cd /root/nexuvi/deploy
printf 'DEV_TOKEN_SECRET=%s\n' "$(openssl rand -hex 32)" > .env
chmod 600 .env
```

Compose refuses to start without this, which is deliberate — the previous default was the
literal string `dev-secret-change-in-prod`.

## Deploying

```bash
cd /root/nexuvi && git pull
cd deploy && docker compose up -d && docker compose logs -f app
```

The container builds from a fresh clone on every start, so a deploy is `git push` on your
machine followed by the two lines above. Expect roughly three minutes for install and build.
It is up when the log shows `Nexuvi Core API started` and two `✓ Ready` lines.

## Checking it

```bash
curl -s http://127.0.0.1:3001/api/health/live      # on the droplet
curl -sI https://nexuvi.health                      # from anywhere
```

`https://nexuvi.health` should answer. A hostname with no clinic behind it reaches the app and
renders unbranded rather than erroring — the hostname selects branding, never data.

## Provisioning a clinic

Until the operator console exists, from the droplet:

```bash
cd /root/nexuvi/deploy
docker compose exec app pnpm --filter @nexuvi/core-api provision \
  --name "Freetown Family Group" --slug freetown-family-group \
  --admin-email admin@example.com --admin-name "A Name" --city freetown
```

It prints a `setupUrl` on `{slug}-app.nexuvi.health` holding a single-use invite. That link is
how the clinic's first administrator sets their password; everyone else they invite themselves.

Slugs ending in `-app` are refused, because `wellness-app.nexuvi.health` would otherwise be
both `wellness-app`'s portal and `wellness`'s staff workspace.
