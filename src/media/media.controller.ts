import {
  Controller,
  Post,
  Patch,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Param,
  BadRequestException,
  Delete,
  Get,
  Res,
  Request,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { MediaService } from './media.service';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
} from '@nestjs/swagger';
import {
  profilePictureConfig,
  galleryPhotosConfig,
  videoConfig,
} from 'src/utils/file-upload.config';

@ApiTags('Media Upload')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('profile-picture')
  @ApiOperation({ summary: 'Upload profile picture' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: 'Profile picture uploaded successfully',
  })
  @UseInterceptors(FileInterceptor('profilePicture', profilePictureConfig))
  async uploadProfilePicture(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Profile picture file is required');
    }

    return this.mediaService.updateProfilePicture(req.user.userId, file);
  }

  @Post('gallery')
  @ApiOperation({ summary: 'Upload gallery photos (max 3)' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: 'Gallery photos uploaded successfully',
  })
  @UseInterceptors(FilesInterceptor('galleryPhotos', 3, galleryPhotosConfig))
  async uploadGalleryPhotos(
    @Request() req,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one gallery photo is required');
    }

    if (files.length > 3) {
      throw new BadRequestException('Maximum 3 gallery photos allowed');
    }

    return this.mediaService.updateGalleryPhotos(req.user.userId, files);
  }

  @Patch('gallery/:photoId/resubmit')
  @ApiOperation({ summary: 'Resubmit a rejected gallery photo in-place' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: 'Gallery photo resubmitted successfully',
  })
  @UseInterceptors(FileInterceptor('galleryPhoto', galleryPhotosConfig))
  async resubmitGalleryPhoto(
    @Request() req,
    @Param('photoId') photoId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Gallery photo file is required');
    }
    return this.mediaService.resubmitGalleryPhoto(req.user.userId, photoId, file);
  }

  @Post('video')
  @ApiOperation({ summary: 'Upload profile video' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: 'Profile video uploaded successfully',
  })
  @UseInterceptors(FileInterceptor('profileVideo', videoConfig))
  async uploadProfileVideo(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Profile video file is required');
    }

    return this.mediaService.updateProfileVideo(req.user.userId, file);
  }

  @Delete('profile-picture')
  @ApiOperation({ summary: 'Delete profile picture' })
  @ApiResponse({
    status: 200,
    description: 'Profile picture deleted successfully',
  })
  async deleteProfilePicture(@Request() req) {
    return this.mediaService.deleteProfilePicture(req.user.userId);
  }

  @Delete('gallery/:photoId')
  @ApiOperation({ summary: 'Delete specific gallery photo by index' })
  @ApiResponse({
    status: 200,
    description: 'Gallery photo deleted successfully',
  })
  async deleteGalleryPhoto(@Request() req, @Param('photoId') photoId: string) {
    return this.mediaService.deleteGalleryPhoto(req.user.userId, photoId);
  }

  @Delete('video')
  @ApiOperation({ summary: 'Delete profile video' })
  @ApiResponse({
    status: 200,
    description: 'Profile video deleted successfully',
  })
  async deleteProfileVideo(@Request() req) {
    return this.mediaService.deleteProfileVideo(req.user.userId);
  }

  @Get('profile-picture')
  @ApiOperation({ summary: 'Get profile picture' })
  async getProfilePicture(@Request() req, @Res() res: Response) {
    return this.mediaService.getProfilePicture(req.user.userId, res);
  }

  @Get('gallery')
  @ApiOperation({ summary: 'Get all gallery photos with IDs in base64 format' })
  async getAllGalleryPhotos(@Request() req) {
    return this.mediaService.getAllGalleryPhotos(req.user.userId);
  }

  @Get('gallery/:photoId')
  @ApiOperation({ summary: 'Get gallery photo by index' })
  async getGalleryPhoto(@Request() req, @Param('photoId') photoId: string) {
    return this.mediaService.getGalleryPhoto(req.user.userId, photoId);
  }

  @Get('video')
  @ApiOperation({ summary: 'Get profile video' })
  async getProfileVideo(@Request() req, @Res() res: Response) {
    return this.mediaService.getProfileVideo(req.user.userId, res);
  }

  @Get('user/:userId/profile-picture')
  @ApiOperation({ summary: 'Get profile picture of another user' })
  async getUserProfilePicture(
    @Request() req,
    @Param('userId') userId: string,
    @Res() res: Response,
  ) {
    return this.mediaService.getProfilePicture(userId, res, req.user.userId);
  }

  @Get('user/:userId/gallery')
  @ApiOperation({
    summary: 'Get all gallery photos of another user with IDs in base64 format',
  })
  async getUserAllGalleryPhotos(
    @Request() req,
    @Param('userId') userId: string,
  ) {
    return this.mediaService.getAllGalleryPhotos(userId, req.user.userId);
  }

  @Get('user/:userId/gallery/:photoId')
  @ApiOperation({ summary: 'Get specific gallery photo of another user by ID' })
  async getUserGalleryPhoto(
    @Request() req,
    @Param('userId') userId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.mediaService.getGalleryPhoto(userId, photoId, req.user.userId);
  }

  @Get('user/:userId/video')
  @ApiOperation({ summary: 'Get profile video of another user' })
  async getUserProfileVideo(
    @Request() req,
    @Param('userId') userId: string,
    @Res() res: Response,
  ) {
    return this.mediaService.getProfileVideo(userId, res, req.user.userId);
  }
}
