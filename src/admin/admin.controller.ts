import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { RejectMediaDto } from './dto/reject-media.dto';
import { MediaQueryDto } from './dto/media-query.dto';

@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Get dashboard statistics
   */
  @Get('stats')
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  /**
   * Get all users with pagination and filtering
   */
  @Get('users')
  async getAllUsers(@Query() query: UserQueryDto) {
    return this.adminService.getAllUsers(query);
  }

  /**
   * Get a specific user by ID
   */
  @Get('users/:userId')
  async getUserById(@Param('userId') userId: string) {
    return this.adminService.getUserById(userId);
  }

  /**
   * Update user status (ACTIVE, PENDING, DELETED)
   */
  @Patch('users/:userId/status')
  async updateUserStatus(
    @Param('userId') userId: string,
    @Body() updateStatusDto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(userId, updateStatusDto.status);
  }

  /**
   * Update user role (USER, ADMIN)
   */
  @Patch('users/:userId/role')
  async updateUserRole(
    @Param('userId') userId: string,
    @Body() updateRoleDto: UpdateUserRoleDto,
  ) {
    return this.adminService.updateUserRole(userId, updateRoleDto.role);
  }

  /**
   * Soft delete a user (sets status to DELETED)
   */
  @Delete('users/:userId')
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('userId') userId: string) {
    return this.adminService.deleteUser(userId);
  }

  /**
   * Permanently delete a user from database
   */
  @Delete('users/:userId/permanent')
  @HttpCode(HttpStatus.OK)
  async permanentlyDeleteUser(@Param('userId') userId: string) {
    return this.adminService.permanentlyDeleteUser(userId);
  }

  /**
   * Get users by status
   */
  @Get('users/by-status/:status')
  async getUsersByStatus(@Param('status') status: string) {
    return this.adminService.getUsersByStatus(status);
  }

  // ==================== MEDIA APPROVAL ENDPOINTS ====================

  /**
   * Get pending media for review (with pagination and filtering)
   */
  @Get('media/pending')
  async getPendingMedia(@Query() query: MediaQueryDto) {
    return this.adminService.getPendingMedia(query);
  }

  /**
   * Get all media for a specific user
   */
  @Get('media/user/:userId')
  async getUserMedia(@Param('userId') userId: string) {
    return this.adminService.getUserMedia(userId);
  }

  /**
   * Approve profile picture
   */
  @Patch('media/profile-picture/:userId/approve')
  @HttpCode(HttpStatus.OK)
  async approveProfilePicture(@Param('userId') userId: string) {
    return this.adminService.approveProfilePicture(userId);
  }

  /**
   * Reject profile picture
   */
  @Patch('media/profile-picture/:userId/reject')
  @HttpCode(HttpStatus.OK)
  async rejectProfilePicture(
    @Param('userId') userId: string,
    @Body() rejectDto: RejectMediaDto,
  ) {
    return this.adminService.rejectProfilePicture(userId, rejectDto.reason);
  }

  /**
   * Approve gallery photo
   */
  @Patch('media/gallery/:userId/:photoId/approve')
  @HttpCode(HttpStatus.OK)
  async approveGalleryPhoto(
    @Param('userId') userId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.adminService.approveGalleryPhoto(userId, photoId);
  }

  /**
   * Reject gallery photo
   */
  @Patch('media/gallery/:userId/:photoId/reject')
  @HttpCode(HttpStatus.OK)
  async rejectGalleryPhoto(
    @Param('userId') userId: string,
    @Param('photoId') photoId: string,
    @Body() rejectDto: RejectMediaDto,
  ) {
    return this.adminService.rejectGalleryPhoto(
      userId,
      photoId,
      rejectDto.reason,
    );
  }

  /**
   * Approve profile video
   */
  @Patch('media/video/:userId/approve')
  @HttpCode(HttpStatus.OK)
  async approveProfileVideo(@Param('userId') userId: string) {
    return this.adminService.approveProfileVideo(userId);
  }

  /**
   * Reject profile video
   */
  @Patch('media/video/:userId/reject')
  @HttpCode(HttpStatus.OK)
  async rejectProfileVideo(
    @Param('userId') userId: string,
    @Body() rejectDto: RejectMediaDto,
  ) {
    return this.adminService.rejectProfileVideo(userId, rejectDto.reason);
  }

  /**
   * Batch approve multiple media items
   */
  @Patch('media/batch-approve')
  @HttpCode(HttpStatus.OK)
  async batchApproveMedia(
    @Body()
    body: {
      items: Array<{
        userId: string;
        mediaType: 'profile' | 'gallery' | 'video';
        photoId?: string;
      }>;
    },
  ) {
    return this.adminService.batchApproveMedia(body.items);
  }

  // ==================== CHAT MONITORING ENDPOINTS ====================

  /**
   * Get all chat rooms (paginated, sorted by most recent activity).
   * Pass userId to filter to a specific member's conversations.
   */
  @Get('chats')
  async getAdminChats(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
  ) {
    return this.adminService.getAdminChats(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      userId,
    );
  }

  /**
   * Get messages for a specific chat room (paginated, oldest first)
   */
  @Get('chats/:roomId/messages')
  async getAdminChatMessages(
    @Param('roomId') roomId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAdminChatMessages(
      roomId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
    );
  }

  /**
   * Soft-ban a user (locks account, preserves all data as evidence)
   */
  @Post('users/:userId/ban')
  @HttpCode(HttpStatus.OK)
  async banUser(
    @Param('userId') userId: string,
    @Body() body: { reason?: string },
  ) {
    return this.adminService.banUser(userId, body?.reason);
  }
}
