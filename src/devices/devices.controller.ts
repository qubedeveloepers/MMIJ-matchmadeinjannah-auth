import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from 'src/auth/constants';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dtos/register-device.dto';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @Public()
  async registerDevice(@Body() registerDeviceDto: RegisterDeviceDto) {
    await this.devicesService.register(registerDeviceDto);
  }

  @Get(':firebaseInstallationId/exists')
  @Public()
  async checkDeviceExists(
    @Param('firebaseInstallationId') firebaseInstallationId: string,
  ): Promise<boolean> {
    const device = await this.devicesService.findByFirebaseInstallationId(
      firebaseInstallationId,
    );
    return !!device;
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':firebaseInstallationId')
  async update(
    @Param('firebaseInstallationId') firebaseInstallationId: string,
    @Body('userId') userId?: string,
    @Body('fcmToken') fcmToken?: string,
  ) {
    return await this.devicesService.update(
      firebaseInstallationId,
      userId,
      fcmToken,
    );
  }
}
