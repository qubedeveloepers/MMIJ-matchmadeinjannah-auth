import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SaveProfileDto, BlockProfileDto } from './dtos/user-interaction.dto';
import { UserInteractionService } from './user-interaction.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('user-interactions')
@UseGuards(JwtAuthGuard)
export class UserInteractionController {
  constructor(private userInteractionService: UserInteractionService) {}

  @Post('save')
  async saveProfile(@Body() saveProfileDto: SaveProfileDto, @Request() req) {
    const userId = req.user.userId;
    return await this.userInteractionService.saveProfile(
      userId,
      saveProfileDto.targetUserId,
    );
  }

  @Post('block')
  async blockProfile(@Body() blockProfileDto: BlockProfileDto, @Request() req) {
    const userId = req.user.userId;
    return await this.userInteractionService.blockProfile(
      userId,
      blockProfileDto.targetUserId,
    );
  }

  @Delete('unsave/:targetUserId')
  async unsaveProfile(
    @Param('targetUserId') targetUserId: string,
    @Request() req,
  ) {
    const userId = req.user.userId;
    await this.userInteractionService.unsaveProfile(userId, targetUserId);
    return { message: 'Profile unsaved successfully' };
  }

  @Delete('unblock/:targetUserId')
  async unblockProfile(
    @Param('targetUserId') targetUserId: string,
    @Request() req,
  ) {
    const userId = req.user.userId;
    await this.userInteractionService.unblockProfile(userId, targetUserId);
    return { message: 'Profile unblocked successfully' };
  }

  @Get('saved')
  async getSavedProfiles(@Request() req) {
    const userId = req.user.userId;
    return await this.userInteractionService.getSavedProfiles(userId);
  }

  @Get('saved/:targetUserId')
  async checkSavedProfile(
    @Param('targetUserId') targetUserId: string,
    @Request() req,
  ) {
    const userId = req.user.userId;
    const isSaved = await this.userInteractionService.checkSavedProfile(
      userId,
      targetUserId,
    );
    return {
      isSaved,
    };
  }

  @Get('blocked')
  async getBlockedProfiles(@Request() req) {
    const userId = req.user.userId;
    return await this.userInteractionService.getBlockedProfiles(userId);
  }
}
