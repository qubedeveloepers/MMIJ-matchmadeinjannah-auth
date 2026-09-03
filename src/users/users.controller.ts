import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  Query,
  HttpCode,
  Delete,
  Param,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Public } from 'src/auth/constants';
import { QueryDto } from './dtos/query.dto';
import { UpdateMediaPrivacyDto } from './dtos/mediaPrivacy.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/auth/enums/role.enum';
import { UpdateProfileDto } from './dtos/profile.dto';

@Controller('profile')
export class UserController {
  constructor(private userService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getProfile(@Request() req) {
    const user = await this.userService.getProfile(
      req.user.userId,
      req.user.userId,
    );
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(JwtAuthGuard)
  @Patch()
  async updateProfile(@Request() req, @Body() updateProfileDto: UpdateProfileDto) {
    return await this.userService.updateProfile(
      req.user.userId,
      updateProfileDto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch('media-privacy')
  async updateMediaPrivacy(
    @Request() req,
    @Body() dto: UpdateMediaPrivacyDto,
  ) {
    const user = await this.userService.updateMediaPrivacy(
      req.user.userId,
      dto,
    );
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(JwtAuthGuard)
  @Get('completion')
  getProfileCompletionStatus(@Request() req) {
    return this.userService.getProfileCompletionStatus(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('user/:id')
  async getUserProfile(@Request() req, @Param('id') id: string) {
    const user = await this.userService.getProfile(id, req.user.userId);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  async searchProfiles(@Request() req, @Query() query: QueryDto) {
    const currentUser = req.user;
    return this.userService.searchProfiles(currentUser, query);
  }

  @Public()
  @Get('checkUserNameExists')
  @HttpCode(200)
  async checkUserNameExists(
    @Query('username') username: string,
  ): Promise<{ exists: boolean; suggestions?: string[] }> {
    return this.userService.checkUsernameExists(username.toLowerCase());
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(@Request() req) {
    return this.userService.deleteAccount(req.user.userId);
  }

  @Roles(Role.ADMIN)
  @Get('all')
  async getAllUsers(): Promise<any[]> {
    return this.userService.getAllUsers();
  }
}
