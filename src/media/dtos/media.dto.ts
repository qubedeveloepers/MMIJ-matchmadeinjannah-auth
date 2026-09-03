import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UploadProfilePictureDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Profile picture file (max 2MB, jpg/jpeg/png/gif)',
  })
  profilePicture: Express.Multer.File;
}

export class UploadGalleryPhotosDto {
  @ApiProperty({
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
    description: 'Gallery photos (max 3 files, each max 2MB, jpg/jpeg/png/gif)',
  })
  galleryPhotos: Express.Multer.File[];
}

export class UploadProfileVideoDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Profile video file (max 10MB, mp4/avi/mov/wmv/flv/webm)',
  })
  profileVideo: Express.Multer.File;
}

export class MediaInfoResponseDto {
  @ApiProperty({ description: 'Profile picture path', required: false })
  profilePicture?: string;

  @ApiProperty({ description: 'Array of gallery photo paths', type: [String] })
  galleryPhotos: string[];

  @ApiProperty({ description: 'Number of gallery photos' })
  galleryPhotosCount: number;

  @ApiProperty({ description: 'Profile video path', required: false })
  profileVideo?: string;
}

export class UploadResponseDto {
  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'Uploaded filename', required: false })
  filename?: string;

  @ApiProperty({ description: 'File path', required: false })
  path?: string;

  @ApiProperty({ description: 'File size in bytes', required: false })
  size?: number;

  @ApiProperty({ description: 'Number of uploaded files', required: false })
  uploadedCount?: number;

  @ApiProperty({ description: 'Total count after upload', required: false })
  totalCount?: number;

  @ApiProperty({ description: 'Array of uploaded files info', required: false })
  files?: Array<{
    filename: string;
    path: string;
    size: number;
  }>;
}

export class DeleteResponseDto {
  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({
    description: 'Remaining count after deletion',
    required: false,
  })
  remainingCount?: number;
}
