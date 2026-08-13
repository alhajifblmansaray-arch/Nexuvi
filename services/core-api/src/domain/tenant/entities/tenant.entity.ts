import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Tenant database entity.
 * Maps to the `nexuvi.tenants` table.
 *
 * Includes row-level security partition keys (country_cell_id, tenant_id).
 */
@Entity({ name: 'tenants', schema: 'nexuvi' })
export class TenantEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  country_cell_id: string; // Foreign key to country_cells

  @Column()
  slug: string; // From signup

  @Column()
  legal_name: string;

  @Column()
  plan: string; // 'clinic', 'hospital', 'pharmacy', 'government'

  @Column()
  status: string; // 'draft', 'active', 'suspended', etc.

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  custom_domains: string[];

  @Column({ type: 'jsonb' })
  data_cell: {
    type: 'shared_country_cell' | 'dedicated';
    countryCellId?: string;
    accountId?: string;
    region?: string;
  };

  @Column()
  billing_contact_email: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ nullable: true })
  activated_at?: Date;

  @Column({ nullable: true })
  closed_at?: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
