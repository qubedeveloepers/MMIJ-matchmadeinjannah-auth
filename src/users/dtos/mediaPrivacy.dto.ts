import { IsEnum, IsOptional } from 'class-validator';
import { MediaVisibility } from '../enums/mediaVisibility.enum';

export class UpdateMediaPrivacyDto {
  @IsOptional()
  @IsEnum(MediaVisibility)
  profilePictureVisibility?: MediaVisibility;

  @IsOptional()
  @IsEnum(MediaVisibility)
  galleryPhotosVisibility?: MediaVisibility;

  @IsOptional()
  @IsEnum(MediaVisibility)
  profileVideoVisibility?: MediaVisibility;
}
