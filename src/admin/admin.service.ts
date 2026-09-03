import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { User } from '../users/user.schema';
import { UserStatus } from '../users/enums/userStatus.enum';
import { DeletionReason } from '../users/enums/deletionReason.enum';
import { Role } from '../auth/enums/role.enum';
import { MediaApprovalStatus } from '../users/enums/mediaApprovalStatus.enum';
import { UserQueryDto } from './dto/user-query.dto';
import { MediaQueryDto } from './dto/media-query.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { ChatRoom } from '../chat-room/chat-room.schema';
import { Message } from '../message/message.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(ChatRoom.name) private chatRoomModel: Model<ChatRoom>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @InjectPinoLogger(AdminService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Get dashboard statistics
   */
  async getDashboardStats() {
    const [
      totalUsers,
      activeUsers,
      pendingUsers,
      deletedUsers,
      adminUsers,
      regularUsers,
      pendingProfilePictures,
      pendingGalleryPhotos,
      pendingVideos,
      approvedProfilePictures,
      approvedGalleryPhotos,
      approvedVideos,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ status: UserStatus.ACTIVE }),
      this.userModel.countDocuments({ status: UserStatus.PENDING }),
      this.userModel.countDocuments({ status: UserStatus.DELETED }),
      this.userModel.countDocuments({ role: Role.ADMIN }),
      this.userModel.countDocuments({ role: Role.USER }),
      // Media statistics
      this.userModel.countDocuments({
        profilePicture: { $exists: true, $ne: null },
        profilePictureStatus: MediaApprovalStatus.PENDING,
      }),
      this.userModel.countDocuments({
        galleryPhotos: {
          $elemMatch: { status: MediaApprovalStatus.PENDING },
        },
      }),
      this.userModel.countDocuments({
        profileVideo: { $exists: true, $ne: null },
        profileVideoStatus: MediaApprovalStatus.PENDING,
      }),
      this.userModel.countDocuments({
        profilePicture: { $exists: true, $ne: null },
        profilePictureStatus: MediaApprovalStatus.APPROVED,
      }),
      this.userModel.countDocuments({
        galleryPhotos: {
          $elemMatch: { status: MediaApprovalStatus.APPROVED },
        },
      }),
      this.userModel.countDocuments({
        profileVideo: { $exists: true, $ne: null },
        profileVideoStatus: MediaApprovalStatus.APPROVED,
      }),
    ]);

    // Get recent users (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentUsers = await this.userModel.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
    });

    // Calculate total pending media count
    const totalPendingMedia =
      pendingProfilePictures + pendingGalleryPhotos + pendingVideos;

    return {
      totalUsers,
      usersByStatus: {
        active: activeUsers,
        pending: pendingUsers,
        deleted: deletedUsers,
      },
      usersByRole: {
        admin: adminUsers,
        user: regularUsers,
      },
      recentUsers,
      media: {
        pending: {
          profilePictures: pendingProfilePictures,
          galleryPhotos: pendingGalleryPhotos,
          videos: pendingVideos,
          total: totalPendingMedia,
        },
        approved: {
          profilePictures: approvedProfilePictures,
          galleryPhotos: approvedGalleryPhotos,
          videos: approvedVideos,
        },
      },
    };
  }

  /**
   * Get all users with pagination and filtering
   */
  async getAllUsers(query: UserQueryDto) {
    const { status, role, search, page = 1, limit = 20 } = query;

    const filter: any = {};

    if (status) {
      filter.status = status;
    }

    if (role) {
      filter.role = role;
    }

    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a specific user by ID
   */
  async getUserById(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-password')
      .lean();

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return user;
  }

  /**
   * Update user status
   */
  async updateUserStatus(userId: string, status: UserStatus) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    user.status = status;
    await user.save();

    const { password, ...userWithoutPassword } = user.toObject();
    return {
      message: `User status updated to ${status}`,
      user: userWithoutPassword,
    };
  }

  /**
   * Update user role
   */
  async updateUserRole(userId: string, role: Role) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Prevent demoting the last admin
    if (user.role === Role.ADMIN && role === Role.USER) {
      const adminCount = await this.userModel.countDocuments({
        role: Role.ADMIN,
      });

      if (adminCount === 1) {
        throw new BadRequestException(
          'Cannot demote the last admin user. Create another admin first.',
        );
      }
    }

    user.role = role;
    await user.save();

    const { password, ...userWithoutPassword } = user.toObject();
    return {
      message: `User role updated to ${role}`,
      user: userWithoutPassword,
    };
  }

  /**
   * Soft delete a user (sets status to DELETED)
   */
  async deleteUser(userId: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Prevent deleting admin users via soft delete
    if (user.role === Role.ADMIN) {
      throw new BadRequestException(
        'Cannot delete admin users. Change role to USER first or use permanent delete.',
      );
    }

    user.status = UserStatus.DELETED;
    await user.save();

    return {
      message: 'User soft deleted successfully',
      userId,
    };
  }

  /**
   * Permanently delete a user — delegates to UsersService.deleteAccount for full cleanup
   */
  async permanentlyDeleteUser(userId: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Prevent deleting the last admin
    if (user.role === Role.ADMIN) {
      const adminCount = await this.userModel.countDocuments({
        role: Role.ADMIN,
      });

      if (adminCount === 1) {
        throw new BadRequestException(
          'Cannot delete the last admin user. Create another admin first.',
        );
      }
    }

    await this.usersService.deleteAccount(userId, DeletionReason.ADMIN_BANNED);

    return {
      message: 'User permanently deleted successfully',
      userId,
    };
  }

  /**
   * Get users by status
   */
  async getUsersByStatus(status: string) {
    const upperStatus = status.toUpperCase();

    if (!Object.values(UserStatus).includes(upperStatus as UserStatus)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${Object.values(UserStatus).join(', ')}`,
      );
    }

    const users = await this.userModel
      .find({ status: upperStatus })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    return {
      status: upperStatus,
      count: users.length,
      users,
    };
  }

  // ==================== MEDIA APPROVAL METHODS ====================

  /**
   * Get pending media for admin review
   */
  async getPendingMedia(query: MediaQueryDto) {
    const { status, type, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};

    // Build query based on media type and status
    if (type === 'profile') {
      filter.profilePictureStatus = status || MediaApprovalStatus.PENDING;
      filter.profilePicture = { $exists: true, $ne: null };
    } else if (type === 'gallery') {
      filter['galleryPhotos.status'] = status || MediaApprovalStatus.PENDING;
    } else if (type === 'video') {
      filter.profileVideoStatus = status || MediaApprovalStatus.PENDING;
      filter.profileVideo = { $exists: true, $ne: null };
    } else {
      // Get all pending media
      filter.$or = [
        {
          profilePicture: { $exists: true, $ne: null },
          profilePictureStatus: status || MediaApprovalStatus.PENDING,
        },
        {
          galleryPhotos: {
            $elemMatch: { status: status || MediaApprovalStatus.PENDING },
          },
        },
        {
          profileVideo: { $exists: true, $ne: null },
          profileVideoStatus: status || MediaApprovalStatus.PENDING,
        },
      ];
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select(
          '_id username email firstName lastName profilePicture profilePictureStatus galleryPhotos profileVideo profileVideoStatus',
        )
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    // Convert media to base64 for admin view using Cloudinary
    const usersWithMedia = await Promise.all(
      users.map(async (user) => {
        const mediaData: any = { ...user };

        // Add profile picture data
        if (
          user.profilePicture &&
          user.profilePictureStatus === (status || MediaApprovalStatus.PENDING)
        ) {
          try {
            mediaData.profilePictureData =
              await this.cloudinaryService.getAssetAsBase64(
                user.profilePicture,
                'image',
              );
          } catch (error) {
            this.logger.warn(
              { error, userId: user._id },
              'Error loading profile picture',
            );
          }
        }

        // Add gallery photos data
        if (user.galleryPhotos?.length) {
          const pendingPhotos = user.galleryPhotos.filter(
            (p) => p.status === (status || MediaApprovalStatus.PENDING),
          );
          if (pendingPhotos.length > 0) {
            mediaData.galleryPhotosData = await Promise.all(
              pendingPhotos.map(async (photo) => {
                try {
                  return {
                    ...photo,
                    data: await this.cloudinaryService.getAssetAsBase64(
                      photo.publicId,
                      'image',
                    ),
                  };
                } catch (error) {
                  this.logger.warn(
                    { error, photoId: photo.publicId },
                    'Error loading gallery photo',
                  );
                  return { ...photo, data: null };
                }
              }),
            );
          }
        }

        // Add profile video signed URL
        if (
          user.profileVideo &&
          user.profileVideoStatus === (status || MediaApprovalStatus.PENDING)
        ) {
          try {
            mediaData.profileVideoUrl = this.cloudinaryService.getSignedUrl(
              user.profileVideo,
              'video',
            );
          } catch (error) {
            this.logger.warn(
              { error, userId: user._id },
              'Error generating video signed URL',
            );
          }
        }

        return mediaData;
      }),
    );

    return {
      data: usersWithMedia,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all media for a specific user
   */
  async getUserMedia(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select(
        'profilePicture profilePictureStatus profilePictureRejectionReason galleryPhotos profileVideo profileVideoStatus profileVideoRejectionReason',
      )
      .lean();

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const mediaData: any = {};

    // Profile picture
    if (user.profilePicture) {
      try {
        mediaData.profilePicture = {
          publicId: user.profilePicture,
          status: user.profilePictureStatus,
          rejectionReason: user.profilePictureRejectionReason,
          data: await this.cloudinaryService.getAssetAsBase64(
            user.profilePicture,
            'image',
          ),
        };
      } catch (error) {
        this.logger.warn({ error, userId }, 'Error loading profile picture');
        mediaData.profilePicture = {
          publicId: user.profilePicture,
          status: user.profilePictureStatus,
          rejectionReason: user.profilePictureRejectionReason,
          data: null,
        };
      }
    }

    // Gallery photos
    if (user.galleryPhotos?.length) {
      mediaData.galleryPhotos = await Promise.all(
        user.galleryPhotos.map(async (photo) => {
          try {
            return {
              id: photo.id,
              publicId: photo.publicId,
              status: photo.status,
              rejectionReason: photo.rejectionReason,
              uploadedAt: photo.uploadedAt,
              data: await this.cloudinaryService.getAssetAsBase64(
                photo.publicId,
                'image',
              ),
            };
          } catch (error) {
            this.logger.warn(
              { error, photoId: photo.publicId },
              'Error loading gallery photo',
            );
            return {
              id: photo.id,
              publicId: photo.publicId,
              status: photo.status,
              rejectionReason: photo.rejectionReason,
              uploadedAt: photo.uploadedAt,
              data: null,
            };
          }
        }),
      );
    }

    // Profile video
    if (user.profileVideo) {
      mediaData.profileVideo = {
        publicId: user.profileVideo,
        status: user.profileVideoStatus,
        rejectionReason: user.profileVideoRejectionReason,
        videoUrl: this.cloudinaryService.getSignedUrl(
          user.profileVideo,
          'video',
        ),
      };
    }

    return mediaData;
  }

  /**
   * Approve profile picture
   */
  async approveProfilePicture(userId: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!user.profilePicture) {
      throw new BadRequestException('User has no profile picture to approve');
    }

    user.profilePictureStatus = MediaApprovalStatus.APPROVED;
    user.profilePictureRejectionReason = undefined;
    await user.save();

    this.notificationsService
      .notifyMediaApproved(userId, 'profilePicture')
      .catch((err) =>
        this.logger.error(
          { err, userId },
          '[Admin] notifyMediaApproved (profilePicture) failed',
        ),
      );

    return {
      message: 'Profile picture approved successfully',
      userId,
    };
  }

  /**
   * Reject profile picture
   */
  async rejectProfilePicture(userId: string, reason: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!user.profilePicture) {
      throw new BadRequestException('User has no profile picture to reject');
    }

    // Delete from Cloudinary
    try {
      await this.cloudinaryService.deleteAsset(user.profilePicture, 'image');
    } catch (error) {
      this.logger.warn(
        { error, userId, publicId: user.profilePicture },
        'Failed to delete profile picture from Cloudinary',
      );
    }

    user.profilePicture = undefined;
    user.profilePictureThumbnail = undefined;
    user.profilePictureStatus = MediaApprovalStatus.REJECTED;
    user.profilePictureRejectionReason = reason;
    await user.save();

    this.notificationsService
      .notifyMediaRejected(userId, 'profilePicture', reason)
      .catch((err) =>
        this.logger.error(
          { err, userId },
          '[Admin] notifyMediaRejected (profilePicture) failed',
        ),
      );

    return {
      message: 'Profile picture rejected and deleted',
      userId,
      reason,
    };
  }

  /**
   * Approve gallery photo
   */
  async approveGalleryPhoto(userId: string, photoId: string) {
    const result = await this.userModel.findOneAndUpdate(
      { _id: userId, 'galleryPhotos.id': photoId },
      {
        $set: {
          'galleryPhotos.$.status': MediaApprovalStatus.APPROVED,
          'galleryPhotos.$.rejectionReason': null,
        },
      },
      { new: true },
    );

    if (!result) {
      throw new NotFoundException(
        `User or gallery photo not found for userId: ${userId}, photoId: ${photoId}`,
      );
    }

    this.notificationsService
      .notifyMediaApproved(userId, 'galleryPhoto')
      .catch((err) =>
        this.logger.error(
          { err, userId, photoId },
          '[Admin] notifyMediaApproved (galleryPhoto) failed',
        ),
      );

    return {
      message: 'Gallery photo approved successfully',
      userId,
      photoId,
    };
  }

  /**
   * Reject gallery photo
   */
  async rejectGalleryPhoto(userId: string, photoId: string, reason: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const photo = user.galleryPhotos.find((p) => p.id === photoId);

    if (!photo) {
      throw new NotFoundException(`Gallery photo with ID ${photoId} not found`);
    }

    // Delete from Cloudinary
    try {
      await this.cloudinaryService.deleteAsset(photo.publicId, 'image');
    } catch (error) {
      this.logger.warn(
        { error, userId, photoId, publicId: photo.publicId },
        'Failed to delete gallery photo from Cloudinary',
      );
    }

    // Remove photo from array
    user.galleryPhotos = user.galleryPhotos.filter((p) => p.id !== photoId);
    await user.save();

    this.notificationsService
      .notifyMediaRejected(userId, 'galleryPhoto', reason)
      .catch((err) =>
        this.logger.error(
          { err, userId, photoId },
          '[Admin] notifyMediaRejected (galleryPhoto) failed',
        ),
      );

    return {
      message: 'Gallery photo rejected and deleted',
      userId,
      photoId,
      reason,
    };
  }

  /**
   * Approve profile video
   */
  async approveProfileVideo(userId: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!user.profileVideo) {
      throw new BadRequestException('User has no profile video to approve');
    }

    user.profileVideoStatus = MediaApprovalStatus.APPROVED;
    user.profileVideoRejectionReason = undefined;
    await user.save();

    this.notificationsService
      .notifyMediaApproved(userId, 'profileVideo')
      .catch((err) =>
        this.logger.error(
          { err, userId },
          '[Admin] notifyMediaApproved (profileVideo) failed',
        ),
      );

    return {
      message: 'Profile video approved successfully',
      userId,
    };
  }

  /**
   * Reject profile video
   */
  async rejectProfileVideo(userId: string, reason: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!user.profileVideo) {
      throw new BadRequestException('User has no profile video to reject');
    }

    // Delete from Cloudinary
    try {
      await this.cloudinaryService.deleteAsset(user.profileVideo, 'video');
    } catch (error) {
      this.logger.warn(
        { error, userId, publicId: user.profileVideo },
        'Failed to delete profile video from Cloudinary',
      );
    }

    user.profileVideo = undefined;
    user.profileVideoStatus = MediaApprovalStatus.REJECTED;
    user.profileVideoRejectionReason = reason;
    await user.save();

    this.notificationsService
      .notifyMediaRejected(userId, 'profileVideo', reason)
      .catch((err) =>
        this.logger.error(
          { err, userId },
          '[Admin] notifyMediaRejected (profileVideo) failed',
        ),
      );

    return {
      message: 'Profile video rejected and deleted',
      userId,
      reason,
    };
  }

  /**
   * Batch approve multiple media items
   */
  async batchApproveMedia(
    items: Array<{
      userId: string;
      mediaType: 'profile' | 'gallery' | 'video';
      photoId?: string;
    }>,
  ) {
    const results = await Promise.allSettled(
      items.map((item) => {
        if (item.mediaType === 'profile') {
          return this.approveProfilePicture(item.userId);
        } else if (item.mediaType === 'gallery' && item.photoId) {
          return this.approveGalleryPhoto(item.userId, item.photoId);
        } else if (item.mediaType === 'video') {
          return this.approveProfileVideo(item.userId);
        }
        return Promise.reject(new Error('Invalid media type'));
      }),
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    return {
      message: `Batch approval completed`,
      total: items.length,
      successful,
      failed,
      results,
    };
  }

  // ==================== CHAT MONITORING ENDPOINTS ====================

  async getAdminChats(page: number = 1, limit: number = 20, userId?: string) {
    const skip = (page - 1) * limit;
    const filter: Record<string, any> = {};

    if (userId) {
      filter['participants.id'] = new Types.ObjectId(userId);
    }

    const [rooms, total] = await Promise.all([
      this.chatRoomModel
        .find(filter)
        .sort({ lastActivity: -1 })
        .skip(skip)
        .limit(limit)
        .populate('lastMessage', 'content sender createdAt')
        .lean()
        .exec(),
      this.chatRoomModel.countDocuments(filter),
    ]);

    return {
      data: rooms,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminChatMessages(
    roomId: string,
    page: number = 1,
    limit: number = 50,
  ) {
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({ chatRoomId: roomId, isDeleted: false })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.messageModel.countDocuments({
        chatRoomId: roomId,
        isDeleted: false,
      }),
    ]);

    return {
      data: messages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async banUser(userId: string, reason?: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (user.status === UserStatus.DELETED) {
      throw new BadRequestException('User is already banned or deleted');
    }

    if (user.role === Role.ADMIN) {
      throw new BadRequestException('Cannot ban admin users');
    }

    user.status = UserStatus.DELETED;
    user.deletionReason = DeletionReason.ADMIN_BANNED;
    user.deletedAt = new Date();
    if (reason) {
      user.banReason = reason;
    }
    await user.save();

    // Evict the JWT status cache so the ban takes effect on the next request
    // rather than waiting up to 30s for the cache TTL to expire
    await this.cacheManager.del(`user_status_${userId}`);

    this.logger.info({ userId, reason }, '[banUser] User banned by admin');

    return { message: 'User banned successfully', userId };
  }
}
