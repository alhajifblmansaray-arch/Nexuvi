import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  AuditEvent,
  EncounterQuery,
  EncounterStatus,
  EncounterSummary,
  Paginated,
} from '@nexuvi/api-contracts';

import { EncounterService } from './encounter.service';
import { AssignEncounterDto } from './dto/assign-encounter.dto';
import { AuditService } from '../audit/audit.service';
import { ActorService } from '../../infrastructure/identity/actor';
import { requirePrincipal } from '../../infrastructure/context/request-context';
import { RequirePermission } from '../../infrastructure/identity/permission.guard';
import { PERMISSIONS } from '../../infrastructure/identity/permissions';

const ENCOUNTER_STATUSES: readonly EncounterStatus[] = [
  'scheduled',
  'checked-in',
  'in-progress',
  'awaiting-review',
  'blocked',
  'on-hold',
  'completed',
  'cancelled',
];

/**
 * Encounter REST API.
 *
 * Query strings arrive as `string | undefined` and are narrowed here rather than trusted.
 * An unrecognised `status` is dropped instead of rejected: a stale bookmark should show
 * the unfiltered list, not a 400.
 */
@Controller('encounters')
export class EncounterController {
  constructor(
    private readonly encounterService: EncounterService,
    private readonly auditService: AuditService,
    private readonly actorService: ActorService,
  ) {}

  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  @Get()
  find(
    @Query('status') status?: string,
    @Query('department') department?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Paginated<EncounterSummary> {
    // Built incrementally because `exactOptionalPropertyTypes` forbids writing an
    // explicit `undefined` into an optional field.
    const query: Record<string, unknown> = {};

    if (status && (ENCOUNTER_STATUSES as readonly string[]).includes(status)) {
      query.status = status;
    }
    if (department) query.department = department;
    if (search) query.search = search;

    const pageNumber = toPositiveInt(page);
    if (pageNumber !== null) query.page = pageNumber;

    const size = toPositiveInt(pageSize);
    if (size !== null) query.pageSize = size;

    return this.encounterService.find(requirePrincipal().tenantId, query as EncounterQuery);
  }

  /** Departments present in the dataset, for populating the filter control. */
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  @Get('departments')
  listDepartments(): readonly string[] {
    return this.encounterService.listDepartments(requirePrincipal().tenantId);
  }

  /** Roster for the assignment control. */
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  @Get('clinicians')
  listClinicians() {
    return this.encounterService.listClinicians(requirePrincipal().tenantId);
  }

  /**
   * Fetch one encounter by its human-facing reference (`ENC-10847`).
   *
   * Declared after the literal paths on purpose — Nest matches routes in declaration
   * order, so a `:reference` parameter registered first would swallow `/departments`
   * and `/clinicians`.
   */
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ)
  @Get(':reference')
  findOne(@Param('reference') reference: string): EncounterSummary {
    return this.encounterService.findByReference(requirePrincipal().tenantId, reference);
  }

  /** Everything that has happened to this encounter, oldest first. */
  @RequirePermission(PERMISSIONS.ENCOUNTER_READ, PERMISSIONS.AUDIT_READ)
  @Get(':reference/history')
  history(@Param('reference') reference: string): readonly AuditEvent[] {
    const { tenantId } = requirePrincipal();
    const encounter = this.encounterService.findByReference(tenantId, reference);
    return this.auditService.findForSubject(tenantId, encounter.id);
  }

  /**
   * Assign, reassign, or unassign the encounter's clinician.
   *
   * `200` rather than `201`: this updates an existing encounter, it does not create a
   * resource. The updated encounter comes back in full so the client re-renders from
   * server state instead of patching its own copy and drifting.
   */
  @RequirePermission(PERMISSIONS.ENCOUNTER_ASSIGN)
  @Post(':reference/assign')
  @HttpCode(200)
  assign(
    @Param('reference') reference: string,
    @Body() body: AssignEncounterDto,
  ): EncounterSummary {
    return this.encounterService.assign(
      requirePrincipal().tenantId,
      reference,
      body.clinicianId,
      this.actorService.current(),
      body.reason,
    );
  }
}

function toPositiveInt(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
