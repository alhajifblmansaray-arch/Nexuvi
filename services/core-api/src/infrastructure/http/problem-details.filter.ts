import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

import { currentContext } from '../context/request-context';
import { StructuredLogger } from '../observability/logger';

/**
 * RFC 9457 problem details.
 *
 * `type` is a stable URI a client can branch on; `title` and `detail` are for the person
 * reading the screen. Clients that switch on a prose message break the moment the wording
 * improves, so there is always something machine-stable beside it.
 */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly correlationId: string;
  /** Field-level messages from validation failures. */
  readonly errors?: readonly string[];
}

const PROBLEM_BASE = 'https://docs.nexuvi.health/problems';

const TYPE_BY_STATUS: Record<number, string> = {
  400: 'validation-failed',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not-found',
  409: 'conflict',
  422: 'unprocessable',
  429: 'rate-limited',
  500: 'internal-error',
  503: 'unavailable',
};

/**
 * Converts every unhandled error into a problem document.
 *
 * The rule that matters clinically: **an unexpected error never reaches the client as its
 * own message.** A stack trace or a database error string can carry table names, query
 * fragments, and occasionally row values — patient data leaking through an error page is
 * still a disclosure. Expected errors (the `HttpException` family, which we raise
 * deliberately and word for the reader) pass their message through; anything else is
 * logged in full server-side and answered with a generic sentence plus the correlation id
 * that ties the two together.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const context = currentContext();
    const correlationId = context?.correlationId ?? 'unknown';
    const instance = context?.path ?? '';

    const problem = this.toProblem(exception, correlationId, instance);

    if (problem.status >= 500) {
      this.logger.error(
        problem.title,
        exception instanceof Error ? exception.stack : String(exception),
        'ProblemDetailsFilter',
      );
    } else {
      this.logger.event('warn', 'Request refused', {
        status: problem.status,
        problemType: problem.type,
        detail: problem.detail,
        path: instance,
      });
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .json(problem);
  }

  private toProblem(
    exception: unknown,
    correlationId: string,
    instance: string,
  ): ProblemDetails {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // Nest's ValidationPipe returns `{ message: string[] }`; our own throws are strings.
      const detail =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);

      const errors = Array.isArray(detail) ? detail : undefined;

      return {
        type: `${PROBLEM_BASE}/${TYPE_BY_STATUS[status] ?? 'error'}`,
        title: titleFor(status),
        status,
        detail: Array.isArray(detail) ? 'One or more fields are invalid.' : String(detail),
        instance,
        correlationId,
        ...(errors ? { errors } : {}),
      };
    }

    // Unexpected. The real cause is logged; the client gets the correlation id to quote.
    return {
      type: `${PROBLEM_BASE}/internal-error`,
      title: 'Internal server error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail:
        'The request could not be completed. Quote the correlation id when reporting this.',
      instance,
      correlationId,
    };
  }
}

function titleFor(status: number): string {
  switch (status) {
    case 400:
      return 'Validation failed';
    case 401:
      return 'Authentication required';
    case 403:
      return 'Not permitted';
    case 404:
      return 'Not found';
    case 409:
      return 'Conflict';
    case 429:
      return 'Too many requests';
    case 503:
      return 'Service unavailable';
    default:
      return status >= 500 ? 'Internal server error' : 'Request failed';
  }
}
