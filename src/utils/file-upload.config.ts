import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';
import { BadRequestException } from '@nestjs/common';

// Profile picture configuration - uses memory storage; original is kept,
// Cloudinary applies q_auto/f_auto at delivery
export const profilePictureConfig: MulterOptions = {
  storage: memoryStorage(),
  fileFilter: (req: any, file: Express.Multer.File, callback: any) => {
    if (!file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
      return callback(
        new BadRequestException(
          'Only image files are allowed for profile picture',
        ),
        false,
      );
    }
    callback(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
};

// Gallery photos configuration - uses memory storage; original is kept,
// Cloudinary applies q_auto/f_auto at delivery
export const galleryPhotosConfig: MulterOptions = {
  storage: memoryStorage(),
  fileFilter: (req: any, file: Express.Multer.File, callback: any) => {
    if (!file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
      return callback(
        new BadRequestException('Only image files are allowed for gallery'),
        false,
      );
    }
    callback(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 3, // Maximum 3 files
  },
};

// Video configuration - uses memory storage
export const videoConfig: MulterOptions = {
  storage: memoryStorage(),
  fileFilter: (req: any, file: Express.Multer.File, callback: any) => {
    if (!file.mimetype.match(/\/(mp4|avi|mov|wmv|flv|webm)$/)) {
      return callback(
        new BadRequestException('Only video files are allowed'),
        false,
      );
    }
    callback(null, true);
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
};
