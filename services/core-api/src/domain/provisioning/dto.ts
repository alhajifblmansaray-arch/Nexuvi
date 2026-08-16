import { IsEmail, IsIn, IsString, Length, Matches } from 'class-validator';

const TEMPLATES = ['primary-care', 'hospital', 'dental', 'pharmacy'] as const;
const PLANS = ['essentials', 'practice', 'enterprise'] as const;

/**
 * Provisioning input.
 *
 * Validated at the edge as well as in the service. The edge check gives a clear
 * field-level message; the service check is the one that actually protects the invariants,
 * because it is the one a future internal caller also passes through.
 */
export class ProvisionTenantDto {
  @IsString()
  @Length(2, 200)
  legalName!: string;

  @IsString()
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,60}[a-z0-9])$/, {
    message:
      'Use 3–62 characters: lowercase letters, numbers and hyphens, not starting or ending with a hyphen.',
  })
  slug!: string;

  @IsString()
  countryCellId!: string;

  @IsIn(TEMPLATES)
  template!: (typeof TEMPLATES)[number];

  @IsIn(PLANS)
  plan!: (typeof PLANS)[number];

  @IsEmail({}, { message: 'A valid administrator email is required.' })
  adminEmail!: string;

  @IsString()
  @Length(2, 120)
  adminName!: string;

  @IsString()
  @Length(2, 200)
  facilityName!: string;

  @IsString()
  @Length(1, 120)
  city!: string;

  @IsString()
  timezone!: string;
}
