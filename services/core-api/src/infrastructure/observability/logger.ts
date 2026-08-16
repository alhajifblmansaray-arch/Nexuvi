import { Injectable, LoggerService } from '@nestjs/common';

import { currentContext } from '../context/request-context';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Structured JSON logger.
 *
 * One JSON object per line, so an aggregator can index fields rather than regex over
 * prose. Every line carries the correlation id and — when authenticated — the user and
 * tenant, which is what makes "show me everything that happened in this request" a query
 * instead of an afternoon.
 *
 * **Never log clinical content.** Identifiers and references only. A log line naming a
 * patient's condition is a disclosure that outlives the request, is copied to every log
 * sink, and sits outside the access controls the record itself is behind.
 */
@Injectable()
export class StructuredLogger implements LoggerService {
  constructor(private readonly minimum: LogLevel = 'info') {}

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }
  error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack ? { stack } : undefined);
  }
  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }
  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }
  verbose(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  /** Structured event with arbitrary fields. Prefer this over interpolated strings. */
  event(level: LogLevel, message: string, fields: Record<string, unknown>): void {
    this.write(level, message, undefined, fields);
  }

  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    fields?: Record<string, unknown>,
  ): void {
    if (ORDER[level] < ORDER[this.minimum]) return;

    const ctx = currentContext();
    const line = {
      ts: new Date().toISOString(),
      level,
      msg: typeof message === 'string' ? message : JSON.stringify(message),
      ...(context ? { context } : {}),
      ...(ctx
        ? {
            correlationId: ctx.correlationId,
            ...(ctx.principal
              ? { userId: ctx.principal.userId, tenantId: ctx.principal.tenantId }
              : {}),
          }
        : {}),
      ...fields,
    };

    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(line)}\n`);
  }
}
