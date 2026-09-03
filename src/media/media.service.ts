import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Response } from 'express';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { User, UserDocument } from 'src/users/user.schema';
import { MediaApprovalStatus } from 'src/users/enums/mediaApprovalStatus.enum';
import { MediaVisibility } from 'src/users/enums/mediaVisibility.enum';
import { v4 as uuidv4 } from 'uuid';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@Injectable()
export class MediaService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly cloudinaryService: CloudinaryService,
    @InjectPinoLogger(MediaService.name)
    private readonly logger: PinoLogger,
  ) {}

  private isAutoApprovedEmail(email?: string): boolean {
    if (!email) return false;
    const list = process.env.AUTO_APPROVE_MEDIA_EMAILS;
    if (!list) return false;
    return list
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.toLowerCase());
  }

  async updateProfilePicture(userId: string, file: Express.Multer.File) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Delete old profile picture from Cloudinary if exists
    if (user.profilePicture) {
      try {
        await this.cloudinaryService.deleteAsset(user.profilePicture, 'image');
      } catch (error) {
        this.logger.warn(
          { error, userId, publicId: user.profilePicture },
          'Failed to delete old profile picture',
        );
      }
    }

    // Upload to Cloudinary with compression/transformation
    const uploadResult = await this.cloudinaryService.uploadProfilePicture(
      file.buffer,
      userId,
    );

    const autoApproved = this.isAutoApprovedEmail(user.email);

    // Generate a 60×60 thumbnail for list-view avatars
    let thumbnailBase64: string | null = null;
    try {
      thumbnailBase64 = await this.cloudinaryService.getAssetThumbnailAsBase64(
        uploadResult.publicId,
      );
    } catch (error) {
      this.logger.warn(
        { error, userId, publicId: uploadResult.publicId },
        'Failed to generate profile picture thumbnail — continuing without it',
      );
    }

    // Update user with new profile picture public_id
    await this.userModel.findByIdAndUpdate(userId, {
      profilePicture: uploadResult.publicId,
      profilePictureStatus: autoApproved ? 'APPROVED' : 'PENDING',
      profilePictureRejectionReason: null,
      ...(thumbnailBase64 !== null && { profilePictureThumbnail: thumbnailBase64 }),
    });

    return {
      message: 'Profile picture uploaded successfully',
      publicId: uploadResult.publicId,
      originalSize: file.size,
      compressedSize: uploadResult.bytes,
      compression: `${((1 - uploadResult.bytes / file.size) * 100).toFixed(2)}%`,
    };
  }

  async updateGalleryPhotos(userId: string, files: Express.Multer.File[]) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if adding new photos would exceed the limit
    // Rejected photos still hold their slot — use resubmit to replace them
    const currentPhotosCount = user.galleryPhotos?.length || 0;
    if (currentPhotosCount + files.length > 3) {
      throw new BadRequestException(
        `Cannot upload ${files.length} photos. Maximum 3 photos allowed. Current count: ${currentPhotosCount}`,
      );
    }

    // Upload all images to Cloudinary
    const uploadResults = await Promise.all(
      files.map((file) =>
        this.cloudinaryService.uploadGalleryImage(file.buffer, userId),
      ),
    );

    const autoApproved = this.isAutoApprovedEmail(user.email);

    // Create new photo entries with Cloudinary public_ids
    const newPhotos = uploadResults.map((result) => ({
      id: uuidv4(),
      publicId: result.publicId,
      status: autoApproved ? 'APPROVED' : 'PENDING',
      uploadedAt: new Date(),
    }));

    // Add new photos to existing ones
    const updatedGalleryPhotos = [...(user.galleryPhotos || []), ...newPhotos];

    await this.userModel.findByIdAndUpdate(userId, {
      galleryPhotos: updatedGalleryPhotos,
    });

    return {
      message: 'Gallery photos uploaded successfully',
      uploadedCount: files.length,
      totalCount: updatedGalleryPhotos.length,
      photos: newPhotos.map((photo, idx) => ({
        id: photo.id,
        publicId: photo.publicId,
        originalSize: files[idx].size,
        compressedSize: uploadResults[idx].bytes,
        compression: `${((1 - uploadResults[idx].bytes / files[idx].size) * 100).toFixed(2)}%`,
      })),
    };
  }

  async resubmitGalleryPhoto(
    userId: string,
    photoId: string,
    file: Express.Multer.File,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const photoIndex = user.galleryPhotos?.findIndex((p) => p.id === photoId);
    if (photoIndex === undefined || photoIndex === -1) {
      throw new NotFoundException('Gallery photo not found');
    }

    const photo = user.galleryPhotos[photoIndex];
    if (photo.status !== MediaApprovalStatus.REJECTED) {
      throw new BadRequestException('Only rejected photos can be resubmitted');
    }

    // Delete the rejected photo from Cloudinary before replacing it
    try {
      await this.cloudinaryService.deleteAsset(photo.publicId, 'image');
    } catch (error) {
      this.logger.warn(
        { error, photoId: photo.publicId },
        'Failed to delete rejected photo from Cloudinary',
      );
    }

    const uploadResult = await this.cloudinaryService.uploadGalleryImage(
      file.buffer,
      userId,
    );

    const autoApproved = this.isAutoApprovedEmail(user.email);

    // Replace the rejected entry in-place — same slot, new image
    const updatedPhotos = [...user.galleryPhotos];
    updatedPhotos[photoIndex] = {
      id: uuidv4(),
      publicId: uploadResult.publicId,
      status: autoApproved ? MediaApprovalStatus.APPROVED : MediaApprovalStatus.PENDING,
      uploadedAt: new Date(),
    };

    await this.userModel.findByIdAndUpdate(userId, {
      galleryPhotos: updatedPhotos,
    });

    return {
      message: 'Gallery photo resubmitted successfully',
      photo: {
        id: updatedPhotos[photoIndex].id,
        publicId: updatedPhotos[photoIndex].publicId,
        originalSize: file.size,
        compressedSize: uploadResult.bytes,
        compression: `${((1 - uploadResult.bytes / file.size) * 100).toFixed(2)}%`,
      },
    };
  }

  async updateProfileVideo(userId: string, file: Express.Multer.File) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Delete old video from Cloudinary if exists
    if (user.profileVideo) {
      try {
        await this.cloudinaryService.deleteAsset(user.profileVideo, 'video');
      } catch (error) {
        this.logger.warn(
          { error, userId, publicId: user.profileVideo },
          'Failed to delete old profile video',
        );
      }
    }

    // Upload to Cloudinary
    const uploadResult = await this.cloudinaryService.uploadVideo(
      file.buffer,
      userId,
    );

    const autoApproved = this.isAutoApprovedEmail(user.email);

    // Update user with new video public_id
    await this.userModel.findByIdAndUpdate(userId, {
      profileVideo: uploadResult.publicId,
      profileVideoStatus: autoApproved ? 'APPROVED' : 'PENDING',
      profileVideoRejectionReason: null,
    });

    return {
      message: 'Profile video uploaded successfully',
      publicId: uploadResult.publicId,
      size: uploadResult.bytes,
    };
  }

  async deleteProfilePicture(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.profilePicture) {
      throw new BadRequestException('No profile picture to delete');
    }

    // Delete from Cloudinary
    await this.cloudinaryService.deleteAsset(user.profilePicture, 'image');

    // Update user document
    await this.userModel.findByIdAndUpdate(userId, {
      $unset: { profilePicture: 1 },
    });

    return { message: 'Profile picture deleted successfully' };
  }

  async deleteGalleryPhoto(userId: string, photoId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Find the photo first to get the publicId for deletion
    const photo = user.galleryPhotos?.find((p) => p.id.toString() === photoId);
    if (!photo) {
      throw new NotFoundException('Gallery photo not found');
    }

    // Delete from Cloudinary
    try {
      await this.cloudinaryService.deleteAsset(photo.publicId, 'image');
    } catch (error) {
      this.logger.warn(
        { error, photoId, publicId: photo.publicId },
        'Failed to delete gallery photo from Cloudinary',
      );
    }

    // Use atomic $pull to remove the photo
    const result = await this.userModel.findByIdAndUpdate(
      userId,
      { $pull: { galleryPhotos: { id: photoId } } },
      { new: true },
    );

    return {
      message: 'Gallery photo deleted successfully',
      deletedPhotoId: photoId,
      remainingCount: result.galleryPhotos?.length || 0,
    };
  }

  async deleteProfileVideo(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.profileVideo) {
      throw new BadRequestException('No profile video to delete');
    }

    // Delete from Cloudinary
    await this.cloudinaryService.deleteAsset(user.profileVideo, 'video');

    // Update user document
    await this.userModel.findByIdAndUpdate(userId, {
      $unset: { profileVideo: 1 },
    });

    return { message: 'Profile video deleted successfully' };
  }

  async getProfilePicture(userId: string, res: Response, viewerUserId?: string) {
    const user = await this.userModel.findById(userId);
    const isSelf = !viewerUserId || viewerUserId === userId;
    const visibility = user?.profilePictureVisibility ?? MediaVisibility.ALL_MEMBERS;
    if (!user || !user.profilePicture || (!isSelf && visibility !== MediaVisibility.ALL_MEMBERS)) {
      throw new NotFoundException('Profile picture not found');
    }

    // Deliver the detail variant (up to 1200px, aspect-preserved, q_auto:good)
    const base64 = await this.cloudinaryService.getProfilePictureAsBase64(
      user.profilePicture,
      'detail',
    );

    return res.json({
      media: base64,
    });
  }

  async getAllGalleryPhotos(userId: string, viewerUserId?: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isSelf = !viewerUserId || viewerUserId === userId;
    const visibility = user.galleryPhotosVisibility ?? MediaVisibility.ONLY_ME;
    if (!isSelf && visibility !== MediaVisibility.ALL_MEMBERS) {
      return { photos: [], totalCount: 0 };
    }

    if (!user.galleryPhotos || user.galleryPhotos.length === 0) {
      return {
        photos: [],
        totalCount: 0,
      };
    }

    // Get all public_ids
    const publicIds = user.galleryPhotos.map((photo) => photo.publicId);

    // Fetch the detail variant (up to 1600px, aspect-preserved, q_auto:good)
    const base64Results =
      await this.cloudinaryService.getMultipleGalleryImagesAsBase64(
        publicIds,
        'detail',
      );

    // Map results back to photos with their IDs
    const galleryImages = user.galleryPhotos
      .map((photo) => {
        const base64Result = base64Results.find(
          (r) => r.publicId === photo.publicId,
        );
        if (!base64Result) {
          return null;
        }
        return {
          id: photo.id.toString(),
          media: base64Result.base64,
        };
      })
      .filter((photo) => photo !== null);

    return {
      photos: galleryImages,
      totalCount: galleryImages.length,
    };
  }

  async getGalleryPhoto(userId: string, photoId: string, viewerUserId?: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isSelf = !viewerUserId || viewerUserId === userId;
    const visibility = user.galleryPhotosVisibility ?? MediaVisibility.ONLY_ME;
    if (!isSelf && visibility !== MediaVisibility.ALL_MEMBERS) {
      throw new NotFoundException('Gallery photo not found');
    }

    const photo = user.galleryPhotos?.find((p) => p.id.toString() === photoId);
    if (!photo) {
      throw new NotFoundException('Gallery photo not found');
    }

    // Deliver the detail variant (up to 1600px, aspect-preserved, q_auto:good)
    const base64 = await this.cloudinaryService.getGalleryImageAsBase64(
      photo.publicId,
      'detail',
    );

    return {
      id: photo.id.toString(),
      media: base64,
    };
  }

  async getProfileVideo(userId: string, res: Response, viewerUserId?: string) {
    const user = await this.userModel.findById(userId);
    const isSelf = !viewerUserId || viewerUserId === userId;
    const visibility = user?.profileVideoVisibility ?? MediaVisibility.ONLY_ME;
    if (!user || !user.profileVideo || (!isSelf && visibility !== MediaVisibility.ALL_MEMBERS)) {
      throw new NotFoundException('Profile video not found');
    }

    // Fetch from Cloudinary and return as base64
    const base64 = await this.cloudinaryService.getAssetAsBase64(
      user.profileVideo,
      'video',
    );

    return res.json({
      media: base64,
    });
  }

  // Helper method to get user's media info
  async getUserMediaInfo(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      profilePicture: user.profilePicture || null,
      galleryPhotos: user.galleryPhotos || [],
      galleryPhotosCount: user.galleryPhotos?.length || 0,
      profileVideo: user.profileVideo || null,
    };
  }
}
