import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

/** Liveness and readiness probes. Owns no state. */
@Module({ controllers: [HealthController] })
export class HealthModule {}
