import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AppleUserInfoDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;
}

export class CredentialsDto {
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email' })
  readonly email?: string;

  @IsOptional()
  @IsString()
  readonly username?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  readonly password?: string;

  @IsOptional()
  @IsString()
  readonly accessToken?: string;

  @IsOptional()
  readonly code?: string;

  @IsOptional()
  @IsString()
  readonly redirectUri?: string;

  @IsOptional()
  @IsString()
  readonly newPassword?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AppleUserInfoDto)
  readonly userInfo?: AppleUserInfoDto;
}
