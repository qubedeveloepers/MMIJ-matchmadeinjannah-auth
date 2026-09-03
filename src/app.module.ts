import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { createKeyv } from '@keyv/redis';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { LoggerModule } from 'nestjs-pino';
import { config } from 'dotenv';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat-room/chat.module';
import { FILE_UPLOAD_DIR } from './constants';
import { DevicesModule } from './devices/devices.module';
import { HttpExceptionFilter } from './filters/exception.handler';
import { LoggingModule } from './logging/logging.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';
import { UserInteractionModule } from './user-interaction/user-interaction.module';
import { MediaModule } from './media/media.module';
import { AdminModule } from './admin/admin.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
config({ path: '.env' });

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        autoLogging: true,
        base: {
          service: 'mmij-auth-service',
          environment: process.env.NODE_ENV || 'production',
        },
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            userAgent: req.headers?.['user-agent'],
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
          err: (err) => ({
            type: err.type,
            message: err.message,
            stack: err.stack,
          }),
        },
      },
    }),
    AuthModule,
    UsersModule,
    MailModule,
    ChatModule,
    MongooseModule.forRoot(`${process.env.DB_URL}`),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        stores: [
          createKeyv(
            `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
          ),
        ],
      }),
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      },
    }),
    MulterModule.register({
      dest: FILE_UPLOAD_DIR,
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
    LoggingModule,
    DevicesModule,
    UserInteractionModule,
    MediaModule,
    AdminModule,
    CloudinaryModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
