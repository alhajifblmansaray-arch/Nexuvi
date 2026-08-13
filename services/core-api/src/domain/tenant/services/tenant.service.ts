import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TenantEntity } from '../entities/tenant.entity';
import { FacilityEntity } from '../entities/facility.entity';

/**
 * Tenant domain service: queries and mutations for organizations and facilities.
 *
 * This service is imported by other modules that need to understand the tenant
 * context (e.g., clinical module querying which facilities a user can access).
 *
 * All queries here respect RLS: the database returns only rows visible to the
 * current session's tenant context.
 *
 * No transactions are held across module boundaries; RLS is the boundary.
 */
@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepository: Repository<TenantEntity>,
    @InjectRepository(FacilityEntity)
    private readonly facilityRepository: Repository<FacilityEntity>,
  ) {}

  /**
   * Get a tenant by ID. Respects RLS: only visible if current session has access.
   */
  async getTenantById(tenantId: string): Promise<TenantEntity> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found or not accessible`);
    }
    return tenant;
  }

  /**
   * Get a facility by ID. Respects RLS.
   */
  async getFacilityById(facilityId: string): Promise<FacilityEntity> {
    const facility = await this.facilityRepository.findOne({
      where: { id: facilityId },
    });
    if (!facility) {
      throw new NotFoundException(`Facility ${facilityId} not found or not accessible`);
    }
    return facility;
  }

  /**
   * Get all facilities in the current tenant. Respects RLS.
   */
  async getFacilitiesForCurrentTenant(): Promise<FacilityEntity[]> {
    return this.facilityRepository.find();
  }

  /**
   * Get a facility's opening hours.
   */
  getOpeningHours(facility: FacilityEntity) {
    return facility.opening_hours || {};
  }
}
