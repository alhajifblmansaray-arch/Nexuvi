import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Facility (location) database entity.
 * Maps to the `nexuvi.facilities` table.
 */
@Entity({ name: 'facilities', schema: 'nexuvi' })
export class FacilityEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  organization_id: string;

  @Column()
  country_cell_id: string; // RLS partition key

  @Column('uuid')
  tenant_id: string; // RLS partition key

  @Column()
  name: string;

  @Column()
  slug: string;

  @Column()
  type: string; // 'clinic', 'hospital', 'pharmacy', etc.

  @Column({ type: 'jsonb' })
  address: {
    street?: string;
    city: string;
    district?: string;
    region?: string;
    postalCode?: string;
    country: string;
  };

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ type: 'jsonb', nullable: true })
  opening_hours?: Record<string, { opensAt: string; closesAt: string; isClosed?: boolean }>;

  @CreateDateColumn()
  created_at: Date;
}
