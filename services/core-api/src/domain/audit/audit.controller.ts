import { Controller, Get, Query } from '@nestjs/common';
import type { AuditEvent, AuditQuery, Paginated } from '@nexuvi/api-contracts';

import { AuditService } from './audit.service';
import { requirePrincipal } from '../../infrastructure/context/request-context';
import { RequirePermission } from '../../infrastructure/identity/permission.guard';
import { PERMISSIONS } from '../../infrastructure/identity/permissions';

/**
 * Audit log read API.
 *
 * Read-only, and it will stay that way — there is no endpoint to write an audit event
 * directly. Events are recorded by the module performing the action, inside the same
 * operation, so an action can never succeed while its audit entry silently fails to.
 */
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @RequirePermission(PERMISSIONS.AUDIT_READ)
  @Get()
  find(
    @Query('subjectId') subjectId?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Paginated<AuditEvent> {
    const query: Record<string, unknown> = {};
    if (subjectId) query.subjectId = subjectId;
    if (action) query.action = action;
    if (actorId) query.actorId = actorId;

    const pageNumber = Number.parseInt(page ?? '', 10);
    if (Number.isFinite(pageNumber) && pageNumber > 0) query.page = pageNumber;

    const size = Number.parseInt(pageSize ?? '', 10);
    if (Number.isFinite(size) && size > 0) query.pageSize = size;

    // Tenant comes from the verified session, never from the query string (§17.3).
    return this.auditService.find(requirePrincipal().tenantId, query as AuditQuery);
  }
}
