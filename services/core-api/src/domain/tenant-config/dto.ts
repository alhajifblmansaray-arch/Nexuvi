import { Type } from 'class-transformer';
import type { PortalSection } from '@nexuvi/api-contracts';
import {
  IsArray,
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

const TYPEFACES = ['inter', 'source-sans', 'ibm-plex', 'system'] as const;
/** The closed set, shared with the contract so the two cannot drift apart. */
const SECTIONS: readonly PortalSection[] = [
  'appointments', 'visits', 'results', 'medications', 'documents', 'messages', 'billing',
];

/**
 * Brand input.
 *
 * `@IsHexColor` is the shape check. The *meaningful* check is contrast, which happens in
 * `BrandingService` — a syntactically valid colour that cannot carry readable text is
 * still refused, with the nearest workable shade offered back.
 */
export class BrandingPatchDto {
  @IsOptional() @IsHexColor() primary?: string;
  @IsOptional() @IsHexColor() secondary?: string;
  @IsOptional() @IsHexColor() success?: string;
  @IsOptional() @IsHexColor() warning?: string;
  @IsOptional() @IsHexColor() danger?: string;
  @IsOptional() @IsHexColor() info?: string;
  @IsOptional() @IsIn(TYPEFACES) typeface?: (typeof TYPEFACES)[number];
}

/** Plain text throughout — rendered as text, never as markup. */
export class ProfilePatchDto {
  @IsOptional() @IsString() @Length(1, 200) displayName?: string;
  @IsOptional() @IsString() @Length(0, 200) tagline?: string;
  @IsOptional() @IsString() @Length(0, 2000) about?: string;
  @IsOptional() @IsString() @Length(0, 40) phone?: string;
  @IsOptional() @IsString() @Length(0, 200) email?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) addressLines?: string[];
  @IsOptional() @IsString() @Length(0, 500) emergencyNotice?: string;
}

export class PortalPatchDto {
  /**
   * A closed set. Composing from blocks the platform ships is what keeps this safe.
   *
   * Typed as the union rather than `string[]`: `@IsIn` already guarantees it at runtime,
   * so a looser static type would only push a cast onto every consumer.
   */
  @IsOptional() @IsArray() @IsIn(SECTIONS, { each: true }) sections?: PortalSection[];
  @IsOptional() @IsString() @Length(0, 200) welcomeHeading?: string;
  @IsOptional() @IsString() @Length(0, 1000) welcomeBody?: string;
  @IsOptional() @IsString() @Length(0, 500) bookingInstructions?: string;
}

export class UpdateDraftDto {
  @IsOptional() @ValidateNested() @Type(() => BrandingPatchDto) branding?: BrandingPatchDto;
  @IsOptional() @ValidateNested() @Type(() => ProfilePatchDto) profile?: ProfilePatchDto;
  @IsOptional() @ValidateNested() @Type(() => PortalPatchDto) portal?: PortalPatchDto;
}
