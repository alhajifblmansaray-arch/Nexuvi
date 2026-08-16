# Exposing a local trial on a real domain

Runs the three local dev servers behind one Cloudflare Tunnel, so `{clinic}.example.com`
and `{clinic}.app.example.com` reach your laptop over real HTTPS. Nothing is deployed —
hot reload and the trial snapshot keep working exactly as they do now.

Cost: the tunnel is free. You pay only for the domain.

## 1. Buy a domain

**Cloudflare Registrar** is the recommendation, for a specific reason rather than brand
loyalty: it sells at wholesale cost with no markup and no first-year-cheap/renewal-expensive
trick, and it is the only registrar here that also gives you free wildcard DNS, free
wildcard TLS, and the tunnel itself. One account, one bill, no certificate management.

On the TLD:

| TLD | Roughly | Notes |
| --- | --- | --- |
| `.com` | $10/yr | Boring and fine. |
| `.app` / `.dev` | $14–20/yr | On the HSTS preload list — browsers refuse plain HTTP outright. Good fit for something holding patient data. |
| `.care`, `.clinic` | $25–40/yr | Reads well for the product. |
| `.health` | **$70–100/yr** | Expensive, and some registries restrict it. Not worth it for a trial. |

Cloudflare Registrar cannot register every TLD; if yours is unsupported, buy at
**Porkbun** and move DNS to Cloudflare (free) — everything below still works.

## 2. Point the domain at Cloudflare

Cloudflare Registrar does this for you. If you bought elsewhere, add the site in the
Cloudflare dashboard and set the registrar's nameservers to the two it gives you.

## 3. Install and authenticate

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create nexuvi-trial
```

`create` prints a tunnel UUID and writes credentials to `~/.cloudflared/<UUID>.json`.

## 4. Route the wildcards

Two wildcard records — patients and staff live on separate origins, so both are needed:

```bash
cloudflared tunnel route dns nexuvi-trial '*.example.com'
cloudflared tunnel route dns nexuvi-trial '*.app.example.com'
```

Cloudflare issues wildcard TLS automatically. `*.example.com` does **not** cover
`*.app.example.com` — wildcards match one label only, which is why there are two.

## 5. Configure the tunnel

Copy `config.example.yml` to `~/.cloudflared/config.yml`, replacing `example.com` with your
domain and `<UUID>` with the tunnel id.

## 6. Run it

Four terminals — or use `pnpm trial` from the repo root, which runs all of them.

```bash
# API
DEV_TOKEN_SECRET=$(openssl rand -hex 32) \
PLATFORM_DOMAIN=example.com \
CORS_ORIGINS=https://app.example.com \
  pnpm --filter @nexuvi/core-api dev

# staff app, patient portal, tunnel
pnpm --filter @nexuvi/clinical-web dev
pnpm --filter @nexuvi/patient-portal dev
cloudflared tunnel run nexuvi-trial
```

Keep that `DEV_TOKEN_SECRET` — the provisioning CLI reads it from the environment, and
without it the API refuses to mint platform tokens for any non-local caller.

Once the tunnel is up, `STAFF_HOST` and `PORTAL_HOST` are no longer needed: real requests
arrive on real clinic hostnames, and the host resolver reads them directly.

## What this does not give you

The tunnel exposes your laptop. Close it and the trial goes down. It is the right shape for
"let me use this and show it to someone", not for a clinic depending on it.

It also still runs `NODE_ENV=development`, which means locally-signed tokens and the
snapshot datastore. That combination is deliberately refused in production, and the reason
holds here too: **synthetic patients only.**
