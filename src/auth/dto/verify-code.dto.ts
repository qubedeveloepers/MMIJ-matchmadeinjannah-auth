import { IsEmail, IsInt, Max, Min } from 'class-validator';

export class VerifyCodeDto {
  @IsEmail()
  readonly email: string;

  @IsInt()
  @Min(100000)
  @Max(999999)
  readonly code: number;
}
