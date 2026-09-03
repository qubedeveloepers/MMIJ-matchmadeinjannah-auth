import { IsEmail, IsInt, IsString, Max, Min, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  readonly email: string;

  @IsString()
  @MinLength(6)
  readonly password: string;

  @IsInt()
  @Min(100000)
  @Max(999999)
  readonly code: number;
}
