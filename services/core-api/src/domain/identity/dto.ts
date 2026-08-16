import { IsArray, IsEmail, IsIn, IsString, Length } from 'class-validator';

export class AcceptInviteDto {
  @IsString()
  @Length(20, 200)
  token!: string;

  /**
   * Length bounds only. The real policy lives in `checkPasswordPolicy`, which reports every
   * problem at once with wording written for the person choosing a password — a bare
   * "invalid" from a decorator is not something anyone can act on.
   */
  @IsString()
  @Length(1, 200)
  password!: string;
}

/** An administrator inviting a colleague into their own clinic. */
export class InviteColleagueDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @IsString()
  @Length(2, 120)
  displayName!: string;

  /**
   * Roles from the preset list. Not free text — an invitation that can name an arbitrary
   * role is an invitation that can name one nobody reviewed.
   */
  @IsArray()
  @IsIn(['administrator', 'physician', 'nurse', 'receptionist'], { each: true })
  roles!: string[];
}

export class SignInDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}
