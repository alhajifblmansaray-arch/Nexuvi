import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import { runWithContext, type RequestContext } from './request-context';
import { HostResolver } from '../tenancy/host-resolver';

/** Header a caller may use to continue an existing trace across services. */
const CORRELATION_HEADER = 'x-correlation-id';

/** Accepts only an opaque, bounded id — the value is echoed into logs and headers. */
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Establishes the per-request context.
 *
 * Runs before the guards so that authentication failures are still logged against a
 * correlation id — an unauthenticated request that gets rejected is exactly the kind you
 * later need to trace.
 *
 * An inbound correlation id is honoured only if it looks like one. Echoing an arbitrary
 * caller-supplied string into log lines and response headers is a log-injection and
 * response-splitting vector, and the id is not worth that.
 */
/** `X-Forwarded-Host` may arrive repeated; the first value is the original client's. */
function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value?.split(',')[0]?.trim();
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly hosts: HostResolver) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const inbound = request.header(CORRELATION_HEADER);
    const correlationId =
      inbound && SAFE_CORRELATION_ID.test(inbound) ? inbound : randomUUID();

    const context: RequestContext = {
      correlationId,
      startedAt: Date.now(),
      method: request.method,
      path: request.originalUrl.split('?')[0] ?? request.originalUrl,
      ipAddress: request.ip,
      principal: undefined,
      requestHost: (
        firstHeaderValue(request.headers['x-forwarded-host']) ?? request.headers.host
      )?.toLowerCase(),
      // Branding only. The token decides data; see HostResolver.
      hostTenantId: this.hosts.resolve(
        request.headers.host,
        firstHeaderValue(request.headers['x-forwarded-host']),
      ),
    };

    response.setHeader(CORRELATION_HEADER, correlationId);
    runWithContext(context, () => next());
  }
}
