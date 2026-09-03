import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from './user.schema';
import { UserController } from './users.controller';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from 'src/auth/constants';
import { PassportModule } from '@nestjs/passport';
import { UserInteractionModule } from 'src/user-interaction/user-interaction.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { Device, DeviceSchema } from 'src/devices/schemas/device.schema';
import {
  UserInteraction,
  UserInteractionSchema,
} from 'src/user-interaction/user-interaction.schema';
import {
  ChatRequest,
  ChatRequestSchema,
} from 'src/chat-request/chat-request.schema';
import { ChatRoom, ChatRoomSchema } from 'src/chat-room/chat-room.schema';
import { Message, MessageSchema } from 'src/message/message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: Device.name, schema: DeviceSchema },
      { name: UserInteraction.name, schema: UserInteractionSchema },
      { name: ChatRequest.name, schema: ChatRequestSchema },
      { name: ChatRoom.name, schema: ChatRoomSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    JwtModule.register({
      secret: jwtConstants.secret,
    }),
    PassportModule,
    forwardRef(() => UserInteractionModule),
    NotificationsModule,
  ],
  providers: [UsersService],
  controllers: [UserController],
  exports: [UsersService],
})
export class UsersModule {}
