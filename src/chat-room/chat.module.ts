import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatRoom, ChatRoomSchema } from './chat-room.schema';
import { Message, MessageSchema } from 'src/message/message.schema';
import { User, UserSchema } from 'src/users/user.schema';
import { AuthModule } from 'src/auth/auth.module';
import {
  ChatRequest,
  ChatRequestSchema,
} from 'src/chat-request/chat-request.schema';
import { UsersModule } from 'src/users/users.module';
import { UserInteractionModule } from 'src/user-interaction/user-interaction.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatRoom.name, schema: ChatRoomSchema },
      { name: Message.name, schema: MessageSchema },
      { name: User.name, schema: UserSchema },
      { name: ChatRequest.name, schema: ChatRequestSchema },
    ]),
    AuthModule,
    UserInteractionModule,
    NotificationsModule,
    UsersModule,
  ],
  providers: [ChatGateway, ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
