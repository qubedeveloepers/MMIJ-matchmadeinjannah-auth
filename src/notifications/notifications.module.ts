import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { DevicesModule } from 'src/devices/devices.module';
import { MailModule } from 'src/mail/mail.module';
import { Message, MessageSchema } from 'src/message/message.schema';
import { User, UserSchema } from 'src/users/user.schema';
import { FirebaseAdminProvider } from './firebase-admin.provider';
import { PUSH_QUEUE_NAME } from './notifications.constants';
import { NotificationsService } from './notifications.service';
import { PushNotificationProcessor } from './push-notification.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: PUSH_QUEUE_NAME }),
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: User.name, schema: UserSchema },
    ]),
    DevicesModule,
    MailModule,
  ],
  providers: [
    FirebaseAdminProvider,
    NotificationsService,
    PushNotificationProcessor,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
