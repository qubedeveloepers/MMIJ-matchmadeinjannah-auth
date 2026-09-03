import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { PlatformInfoDto } from './platform-info.dto';

export class RegisterDeviceDto {
  /** Nested object containing platform-specific device information */
  @ValidateNested()
  @Type(() => PlatformInfoDto)
  platform: PlatformInfoDto;

  /** Firebase installation ID (unique per app installation) */
  @IsString()
  firebaseInstallationId: string;

  /** Internal user ID associated with the device */
  @IsOptional()
  @IsString()
  userId?: string;

  /** FCM token for push notifications */
  @IsString()
  fcmToken: string;
}
