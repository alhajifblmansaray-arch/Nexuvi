import { Module } from '@nestjs/common';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard module: read-only operational aggregates.
 *
 * Owned by: Dashboard module
 * Private tables: none — this module owns no state.
 * Exported: nothing.
 *
 * This is a *read model*. It composes figures that belong to other modules (encounters,
 * orders, integrations) and must never become the place those figures are defined. When
 * the clinical and lab modules land, the aggregation here reads their query services
 * rather than their tables, so the module boundary in blueprint §10.2 holds.
 */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
