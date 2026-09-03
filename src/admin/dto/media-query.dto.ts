import { IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MediaApprovalStatus } from '../../users/enums/mediaApprovalStatus.enum';

export class MediaQueryDto {
  @IsOptional()
  @IsEnum(MediaApprovalStatus)
  status?: MediaApprovalStatus;

  @IsOptional()
  @IsEnum(['profile', 'gallery', 'video'])
  type?: 'profile' | 'gallery' | 'video';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}
