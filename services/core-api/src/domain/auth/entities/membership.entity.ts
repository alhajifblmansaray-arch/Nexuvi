import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Membership database entity: user + role + org/facility/dept.
 * Maps to `nexuvi.memberships` table.
 *
 * One row per (user, organization) pair. Roles, facility scopes, and specialties
 * are stored as arrays.
 */
@Entity({ name: 'memberships', schema: 'nexuvi' })
export class MembershipEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  user_id: string;

  @Column('uuid')
  organization_id: string;

  @Column()
  country_cell_id: string;

  @Column('uuid')
  tenant_id: string;

  @Column({ type: 'uuid', array: true, default: () => "'{}'" })
  facility_ids: string[]; // Empty = all facilities

  @Column({ type: 'uuid', array: true, default: () => "'{}'" })
  department_ids: string[]; // Empty = all departments

  @Column({ type: 'text', array: true })
  roles: string[]; // ['physician', 'clinical_director', ...]

  @Column({ type: 'text', array: true, nullable: true })
  specialties?: string[];

  @Column({ nullable: true })
  license_number?: string;

  @Column({ nullable: true })
  license_expiry?: Date;

  @Column({ default: true })
  is_active: boolean;

  @Column({ nullable: true })
  invited_at?: Date;

  @Column({ nullable: true })
  accepted_at?: Date;

  @CreateDateColumn()
  created_at: Date;
}
