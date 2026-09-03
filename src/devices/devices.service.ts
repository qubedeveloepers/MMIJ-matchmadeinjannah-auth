import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { RegisterDeviceDto } from './dtos/register-device.dto';
import { Device } from './schemas/device.schema';

@Injectable()
export class DevicesService {
  constructor(
    @InjectModel(Device.name) private readonly deviceModel: Model<Device>,
    @InjectPinoLogger(DevicesService.name)
    private readonly logger: PinoLogger,
  ) {}

  async register(registerDeviceDto: RegisterDeviceDto): Promise<Device> {
    try {
      const registeredDevice = new this.deviceModel(registerDeviceDto);
      return registeredDevice.save();
    } catch (error) {
      this.logger.error(
        {
          error,
          firebaseInstallationId: registerDeviceDto.firebaseInstallationId,
        },
        'Failed to register device',
      );
      throw error;
    }
  }

  async findByFirebaseInstallationId(
    firebaseInstallationId: string,
  ): Promise<Device | null> {
    if (!firebaseInstallationId || firebaseInstallationId.trim() === '') {
      throw new BadRequestException(
        'firebaseInstallationId must not be empty or null',
      );
    }
    return this.deviceModel.findOne({ firebaseInstallationId }).exec();
  }

  async update(
    firebaseInstallationId: string,
    userId?: string | null,
    fcmToken?: string | null,
  ): Promise<Device> {
    try {
      const updateObj = Object.fromEntries(
        Object.entries({ userId, fcmToken }).filter(
          ([, value]) => value !== undefined,
        ),
      );

      const device = await this.deviceModel
        .findOneAndUpdate({ firebaseInstallationId }, updateObj, { new: true })
        .exec();

      if (!device) {
        throw new NotFoundException('mmij-23');
      }

      return device;
    } catch (error) {
      this.logger.error(
        { error, firebaseInstallationId, userId, fcmToken },
        'Failed to update device',
      );
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<Device[]> {
    if (!userId) {
      return [];
    }
    return this.deviceModel.find({ userId }).exec();
  }

  async deleteByFcmToken(fcmToken: string): Promise<void> {
    try {
      await this.deviceModel.deleteOne({ fcmToken }).exec();
    } catch (error) {
      this.logger.error(
        { error, fcmToken },
        'Failed to delete device by FCM token',
      );
    }
  }
}
