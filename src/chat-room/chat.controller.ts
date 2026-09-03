import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Delete,
  Put,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { QueryDto } from 'src/users/dtos/query.dto';
import { UsersService } from 'src/users/users.service';
import { NotificationsService } from 'src/notifications/notifications.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    @InjectPinoLogger(ChatController.name)
    private readonly logger: PinoLogger,
  ) {}

  @Post('rooms')
  async createChatRoom(@Request() req, @Body() body: { userId: string }) {
    return this.chatService.createChatRoom(req.user.userId, body.userId);
  }

  @Get('rooms')
  async getUserChatRooms(@Request() req) {
    return this.chatService.getUserChatRooms(req.user.userId);
  }

  @Get('rooms/:roomId')
  async getChatRoom(@Param('roomId') roomId: string) {
    return this.chatService.getChatRoom(roomId);
  }

  @Get('rooms/:roomId/messages')
  async getChatMessages(
    @Param('roomId') roomId: string,
    @Query() query: QueryDto,
    @Request() req,
  ) {
    return this.chatService.getChatMessages(roomId, req.user.userId, query);
  }

  @Delete('messages/:messageId')
  async deleteMessage(@Param('messageId') messageId: string, @Request() req) {
    return this.chatService.deleteMessage(messageId, req.user.userId);
  }

  // New chat request endpoints
  @Post('requests')
  async sendChatRequest(
    @Request() req,
    @Body()
    body: {
      receiverId: string;
      message?: string;
    },
  ) {
    const senderInfo = {
      email: req.user.email,
      username: req.user.username,
    };
    const chatRequest = await this.chatService.sendChatRequest(
      req.user.userId,
      body.receiverId,
      senderInfo,
      body.message,
    );

    const senderUser = await this.usersService.findById(req.user.userId);
    const displayName = senderUser.firstName || senderUser.username;
    this.logger.info(
      {
        senderId: req.user.userId,
        receiverId: body.receiverId,
        chatRequestId: chatRequest._id.toString(),
        displayName,
      },
      '[ChatController] Triggering notifyChatRequest push notification',
    );
    this.notificationsService
      .notifyChatRequest(
        body.receiverId,
        displayName,
        req.user.userId,
        chatRequest._id.toString(),
      )
      .catch((err) =>
        this.logger.error(
          { err, receiverId: body.receiverId },
          '[ChatController] notifyChatRequest push notification failed',
        ),
      );

    return chatRequest;
  }

  @Get('requests/incoming')
  async getIncomingChatRequests(@Request() req) {
    return this.chatService.getIncomingChatRequests(req.user.userId);
  }

  @Get('requests/sent')
  async getSentChatRequests(@Request() req) {
    return this.chatService.getSentChatRequests(req.user.userId);
  }

  @Put('requests/:requestId/accept')
  async acceptChatRequest(
    @Param('requestId') requestId: string,
    @Request() req,
  ) {
    return this.chatService.acceptChatRequest(requestId, req.user.userId);
  }

  @Put('requests/:requestId/reject')
  async rejectChatRequest(
    @Param('requestId') requestId: string,
    @Request() req,
  ) {
    return this.chatService.rejectChatRequest(requestId, req.user.userId);
  }

  @Get('can-chat/:userId')
  async canUsersChat(@Param('userId') otherUserId: string, @Request() req) {
    return {
      canChat: await this.chatService.canUsersChat(
        req.user.userId,
        otherUserId,
      ),
    };
  }

  @Get('does-chat-request-exist/:userId')
  async doesChatRequestExist(
    @Param('userId') otherUserId: string,
    @Request() req,
  ) {
    return {
      chatRequestExists: await this.chatService.doesChatRequestExist(
        req.user.userId,
        otherUserId,
      ),
    };
  }
}
