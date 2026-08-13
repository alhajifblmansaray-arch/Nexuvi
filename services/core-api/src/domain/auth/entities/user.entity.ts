import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * User database entity: authentication identity.
 * Maps to `nexuvi.users` table.
 *
 * Users are created by Cognito; this record tracks local metadata.
 */
@Entity({ name: 'users', schema: 'nexuvi' })
export class UserEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ unique: true })
  external_id: string; // From Cognito

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  phone?: string;

  @Column()
  given_name: string;

  @Column()
  family_name: string;

  @Column({ default: false })
  mfa_enabled: boolean;

  @Column({ nullable: true })
  last_sign_in_at?: Date;

  @CreateDateColumn()
  created_at: Date;
}
