import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * Body of `POST /encounters/:reference/assign`.
 *
 * The global `ValidationPipe` runs with `forbidNonWhitelisted`, so a request carrying any
 * field not declared here is rejected rather than silently ignored — a client sending
 * `{ clinician_id }` should learn that immediately, not discover later that nothing moved.
 */
export class AssignEncounterDto {
  /** `null` unassigns. A missing key is not the same thing and is rejected. */
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'clinicianId must be a clinician id, or null to unassign.' })
  @MinLength(1)
  clinicianId!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A reason must be 500 characters or fewer.' })
  reason?: string;
}
