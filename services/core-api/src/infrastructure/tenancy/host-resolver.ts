import { Injectable } from '@nestjs/common';

import { ConfigService } from '../config/config.service';

import { FACILITIES } from '../persistence/roster-store';
import { TENANTS } from '../persistence/tenants';

/**
 * Maps a request hostname to a tenant.
 *
 * Each clinic gets `{slug}.nexuvi.health` on provisioning, and may later verify a custom
 * domain. The hostname is how an anonymous visitor's request finds the right branding —
 * there is no session yet at that point, so it is the only signal available.
 *
 * **What the hostname does and does not decide.** It selects *branding and public
 * content*. It never selects data. Once a request is authenticated, the tenant is the
 * verified token's tenant (§17.3) and nothing else. The `Host` header is attacker-supplied
 * and always was; treating it as a data scope would hand any caller a tenant switcher.
 *
 * When both exist and disagree, the request is refused rather than resolved — a session
 * riding on another clinic's domain is either a bug or a confusion attack, and quietly
 * picking one of the two answers is how it becomes a breach.
 */
@Injectable()
export class HostResolver {
  constructor(private readonly config: ConfigService) {}

  /** Hosts that are the platform itself, not a tenant. */
  private get platformHosts(): ReadonlySet<string> {
    const domain = this.config.config.platformDomain;
    return new Set(['localhost', '127.0.0.1', domain, `www.${domain}`, `app.${domain}`]);
  }

  private get platformSuffix(): string {
    return `.${this.config.config.platformDomain}`;
  }

  /**
   * Staff surfaces live on their own subdomain: `{slug}.app.nexuvi.health`.
   *
   * A separate origin from the patient portal on purpose. Cookies, storage, and service
   * workers are scoped per origin, so a staff session and a patient session on the same
   * host would share a cookie jar — and a patient landing on a clinic's administration
   * screen is a confusion the URL should prevent rather than the UI apologise for.
   */
  private static readonly STAFF_INFIX = '.app';

  /**
   * Custom domains, verified at provisioning time.
   *
   * A lookup table rather than a pattern: a clinic's own domain is arbitrary, so the only
   * safe test is exact membership of a list the platform wrote. Pattern-matching hostnames
   * is how `freetownfamily.nexuvi.health.evil.com` gets accepted.
   */
  private static readonly CUSTOM_DOMAINS: ReadonlyMap<string, string> = new Map([
    // ['booking.freetownfamily.sl', FREETOWN_GROUP],
  ]);

  /**
   * Tenant for a request's host, or `undefined` when it is the platform or unknown.
   *
   * `X-Forwarded-Host` wins over `Host` when present, because the API sits behind a proxy
   * in every real deployment and `Host` at that point is the proxy's own name. It is also
   * the only workable channel for server-to-server calls: Node's `fetch` refuses to set
   * `Host` at all, since it is a forbidden header name.
   *
   * **Trust boundary.** `X-Forwarded-Host` is only meaningful if the edge *overwrites* it
   * on every inbound request rather than passing a client-supplied value through. That is
   * standard proxy configuration, and it is load-bearing here — an edge that forwards a
   * client's value lets any caller choose which clinic's branding they see.
   *
   * The blast radius is bounded by what this decides: **branding and public content only**.
   * Data is scoped by the verified token's tenant and nothing else (§17.3), so a spoofed
   * host shows the wrong logo, not another clinic's patients.
   */
  resolve(hostHeader: string | undefined, forwardedHost?: string | undefined): string | undefined {
    const host = normaliseHost(forwardedHost) ?? normaliseHost(hostHeader);
    if (!host) return undefined;

    if (this.platformHosts.has(host)) return undefined;

    const custom = HostResolver.CUSTOM_DOMAINS.get(host);
    if (custom) return custom;

    if (host.endsWith(this.platformSuffix)) {
      let label = host.slice(0, -this.platformSuffix.length);

      // `{slug}.app` is the staff surface for the same tenant.
      if (label.endsWith(HostResolver.STAFF_INFIX)) {
        label = label.slice(0, -HostResolver.STAFF_INFIX.length);
      }

      // Exactly one label remaining. `a.b.nexuvi.health` is not a tenant, it is a probe.
      if (label.includes('.') || label === '') return undefined;
      return TENANTS.find((t) => t.slug === label)?.id;
    }

    return undefined;
  }

  /** True when the request arrived on a clinic's staff subdomain rather than its portal. */
  isStaffHost(hostHeader: string | undefined, forwardedHost?: string | undefined): boolean {
    const host = normaliseHost(forwardedHost) ?? normaliseHost(hostHeader);
    return host?.endsWith(`${HostResolver.STAFF_INFIX}${this.platformSuffix}`) ?? false;
  }

  /** The tenant's primary facility name, for branding fallbacks. */
  facilityNameFor(tenantId: string): string | undefined {
    return FACILITIES.find((f) => f.tenantId === tenantId)?.name;
  }
}

/**
 * Lower-cases, strips the port, and rejects anything that is not a plausible hostname.
 *
 * The value is echoed into logs and used as a lookup key, so it is validated rather than
 * trusted — a `Host` header is whatever the client chose to send.
 */
function normaliseHost(hostHeader: string | undefined): string | undefined {
  if (!hostHeader) return undefined;

  const host = hostHeader.split(':')[0]?.trim().toLowerCase();
  if (!host) return undefined;
  if (!/^[a-z0-9.-]{1,253}$/.test(host)) return undefined;

  return host;
}
