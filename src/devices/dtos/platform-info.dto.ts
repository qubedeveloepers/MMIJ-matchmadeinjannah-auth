import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class PlatformInfoDto {
  @IsEnum(['iOS', 'Android'])
  platform: 'iOS' | 'Android';

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  systemName?: string;

  @IsString()
  osVersion: string;

  @IsOptional()
  @IsNumber()
  sdkInt?: number;

  @IsString()
  model: string;

  @IsOptional()
  @IsString()
  modelName?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  device?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  identifierForVendor?: string;

  @IsBoolean()
  isPhysicalDevice: boolean;
}
