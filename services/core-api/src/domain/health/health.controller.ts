import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { Public } from '../../infrastructure/identity/auth.guard';
import { ConfigService } from '../../infrastructure/config/config.service';

/**
 * Liveness and readiness.
 *
 * Two endpoints because orchestrators ask two different questions, and answering both with
 * one probe causes real outages:
 *
 * - **`/health/live`** — is the process up? Never checks dependencies. If a liveness probe
 *   fails because the database is briefly unreachable, the orchestrator restarts every
 *   replica, and a recoverable database blip becomes a total outage.
 * - **`/health/ready`** — should this instance receive traffic? Checks dependencies, so a
 *   replica that cannot serve is taken out of rotation without being killed.
 *
 * Both are public. Requiring a token on a probe means the orchestrator needs credentials
 * to decide whether the service is alive, and the response carries nothing sensitive.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }

  @Public()
  @Get('ready')
  async ready() {
    const checks = await this.runChecks();
    const failed = checks.filter((c) => c.status !== 'ok');

    if (failed.length > 0) {
      throw new ServiceUnavailableException(
        `Not ready: ${failed.map((c) => c.name).join(', ')}`,
      );
    }

    return { status: 'ok', checks };
  }

  private async runChecks(): Promise<{ name: string; status: 'ok' | 'failed'; detail?: string }[]> {
    const driver = this.config.config.dataDriver;

    if (driver === 'memory') {
      // The fixture store has no dependency to check. Reporting a green database check
      // here would claim a connection this process does not have.
      return [{ name: 'data', status: 'ok', detail: 'memory driver — no database dependency' }];
    }

    // The Postgres readiness probe lands with the repository adapters. Reporting `ok`
    // before it exists would let an instance that cannot reach its database take traffic.
    return [
      { name: 'database', status: 'failed', detail: 'Postgres readiness check not implemented.' },
    ];
  }
}
