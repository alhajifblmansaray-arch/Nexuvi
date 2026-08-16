import { Controller, Get } from '@nestjs/common';
import type { OperationsDashboard } from '@nexuvi/api-contracts';

import { DashboardService } from './dashboard.service';
import { requirePrincipal } from '../../infrastructure/context/request-context';
import { RequirePermission } from '../../infrastructure/identity/permission.guard';
import { PERMISSIONS } from '../../infrastructure/identity/permissions';

/**
 * Operations dashboard read API.
 *
 * Read-only by design. Nothing on this surface mutates clinical state — acting on a queue
 * item routes through the owning module's own endpoint, so the audit trail records the
 * clinical action rather than "user viewed dashboard, something changed".
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /** Full dashboard snapshot for the caller's current facility. */
  @RequirePermission(PERMISSIONS.DASHBOARD_READ)
  @Get('operations')
  getOperations(): OperationsDashboard {
    return this.dashboardService.getOperationsDashboard(requirePrincipal().tenantId);
  }
}
