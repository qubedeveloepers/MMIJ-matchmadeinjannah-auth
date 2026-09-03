import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { ChatService } from './chat.service';
import { AuthService } from 'src/auth/auth.service';
import { UsersService } from 'src/users/users.service';
import { NotificationsService } from 'src/notifications/notifications.service';

interface AuthenticatedSocket extends Socket {
  userId: string;
}

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:4000',
      'http://localhost:4001',
      'http://localhost:5173',
      'http://localhost:5174',
      'https://matchmadeinjannah.com',
      'https://www.matchmadeinjannah.com',
    ],
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(
    private readonly chatService: ChatService,
    private readonly authService: AuthService,
    private readonly userService: UsersService,
    private readonly notificationsService: NotificationsService,
    @InjectPinoLogger(ChatGateway.name)
    private readonly logger: PinoLogger,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      this.logger.debug({ clientId: client.id }, 'Handle Connection function');

      const user = await this.authenticateSocket(client);
      if (!user) {
        client.disconnect();
        return;
      }

      client.userId = user._id.toString();

      // Store socket connection
      if (!this.userSockets.has(client.userId)) {
        this.userSockets.set(client.userId, new Set());
      }
      this.userSockets.get(client.userId).add(client.id);

      // Join user to their chat rooms
      const chatRooms = await this.chatService.getUserChatRooms(client.userId);
      chatRooms.forEach((room) => {
        client.join(room._id.toString());
      });

      // Join user to their personal notification room for chat requests
      client.join(`user_${client.userId}`);

      this.logger.info(
        { userId: client.userId, socketId: client.id },
        'User connected with socket',
      );
    } catch (error) {
      this.logger.error('Connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.debug({ clientId: client.id }, 'Handle Disconnect function');
    if (client.userId) {
      const userSockets = this.userSockets.get(client.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }
      this.logger.info({ userId: client.userId }, 'User disconnected');
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() data: { chatRoomId: string; content: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      this.logger.debug({ data, userId: client.userId }, 'Received message');
      const message = await this.chatService.createMessage(
        data.chatRoomId,
        client.userId,
        data.content,
      );

      this.logger.debug({ message }, 'Message created');
      // Emit to all participants in the chat room
      this.server.to(data.chatRoomId).emit('newMessage', message);

      // Mark as delivered for online users
      const chatRoom = await this.chatService.getChatRoom(data.chatRoomId);
      const otherParticipants = chatRoom.participants.filter(
        (p) => p.id.toString() !== client.userId,
      );

      for (const participantId of otherParticipants) {
        if (this.userSockets.has(participantId.toString())) {
          await this.chatService.markMessageAsDelivered(
            message._id,
            participantId.id,
          );
        }
      }

      // Send push notifications to other participants
      const senderDisplayName = message.sender.username;
      for (const participant of otherParticipants) {
        this.notificationsService.notifyNewMessage(
          participant.id.toString(),
          senderDisplayName,
          client.userId,
          data.chatRoomId,
        );
      }
    } catch (error) {
      client.emit('error', { message: 'Failed to send message' });
      this.logger.error('Send message error:', error);
    }
  }

  @SubscribeMessage('sendChatRequest')
  async handleSendChatRequest(
    @MessageBody()
    data: {
      receiverId: string;
      message?: string;
    },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      const senderInfo = await this.userService.findById(client.userId);

      const chatRequest = await this.chatService.sendChatRequest(
        client.userId,
        data.receiverId,
        senderInfo,
        data.message,
      );

      // Notify the receiver about the new chat request
      this.server
        .to(`user_${data.receiverId}`)
        .emit('newChatRequest', chatRequest);

      // Confirm to sender that request was sent
      client.emit('chatRequestSent', { success: true, chatRequest });

      // Send push notification to receiver
      const displayName = senderInfo.firstName || senderInfo.username;
      this.logger.info(
        {
          senderId: client.userId,
          receiverId: data.receiverId,
          chatRequestId: chatRequest._id.toString(),
          displayName,
        },
        '[Gateway] Triggering notifyChatRequest push notification',
      );
      this.notificationsService
        .notifyChatRequest(
          data.receiverId,
          displayName,
          client.userId,
          chatRequest._id.toString(),
        )
        .catch((err) =>
          this.logger.error(
            { err, receiverId: data.receiverId },
            '[Gateway] notifyChatRequest push notification failed',
          ),
        );
    } catch (error) {
      client.emit('error', {
        message: error.message || 'Failed to send chat request',
      });
      this.logger.error('Send chat request error:', error);
    }
  }

  // @SubscribeMessage('acceptChatRequest')
  // async handleAcceptChatRequest(
  //   @MessageBody() data: { requestId: string },
  //   @ConnectedSocket() client: AuthenticatedSocket,
  // ) {
  //   try {
  //     const result = await this.chatService.acceptChatRequest(
  //       data.requestId,
  //       client.userId,
  //     );

  //     const roomId = result.chatRoom._id.toString();
  //     const senderUserId = result.chatRequest.sender.id.toString();
  //     const receiverUserId = result.chatRequest.receiver.id.toString();

  //     console.log('this.server.sockets', this.server.sockets);
  //     console.log('this.server.sockets.sockets', this.server.sockets.sockets);

  //     // Get sender sockets and join them to the room
  //     const senderSockets = this.userSockets.get(senderUserId);
  //     if (senderSockets) {
  //       senderSockets.forEach((socketId) => {
  //         const socket = this.server.sockets.sockets.get(socketId);
  //         if (socket) {
  //           socket.join(roomId);
  //         }
  //       });
  //     }

  //     // Get receiver sockets and join them to the room
  //     const receiverSockets = this.userSockets.get(receiverUserId);
  //     if (receiverSockets) {
  //       receiverSockets.forEach((socketId) => {
  //         const socket = this.server.sockets.sockets.get(socketId);
  //         if (socket) {
  //           socket.join(roomId);
  //         }
  //       });
  //     }

  //     // Notify both users about the accepted request
  //     this.server
  //       .to(`user_${result.chatRequest.sender.id}`)
  //       .emit('chatRequestAccepted', {
  //         chatRequest: result.chatRequest,
  //         chatRoom: result.chatRoom,
  //       });

  //     this.server
  //       .to(`user_${result.chatRequest.receiver.id}`)
  //       .emit('chatRequestAccepted', {
  //         chatRequest: result.chatRequest,
  //         chatRoom: result.chatRoom,
  //       });
  //   } catch (error) {
  //     client.emit('error', {
  //       message: error.message || 'Failed to accept chat request',
  //     });
  //     this.logger.error('Accept chat request error:', error);
  //   }
  // }

  // Alternative approach - let the frontend handle room joining
  @SubscribeMessage('acceptChatRequest')
  async handleAcceptChatRequest(
    @MessageBody() data: { requestId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      const result = await this.chatService.acceptChatRequest(
        data.requestId,
        client.userId,
      );

      const senderUserId = result.chatRequest.sender.id.toString();
      const receiverUserId = result.chatRequest.receiver.id.toString();

      // Notify both users about the accepted request
      // They will automatically join the room when they receive this event
      this.server.to(`user_${senderUserId}`).emit('chatRequestAccepted', {
        chatRequest: result.chatRequest,
        chatRoom: result.chatRoom,
      });

      this.server.to(`user_${receiverUserId}`).emit('chatRequestAccepted', {
        chatRequest: result.chatRequest,
        chatRoom: result.chatRoom,
      });

      // Send push notification to the original sender
      const accepterInfo = await this.userService.findById(client.userId);
      const displayName = accepterInfo.firstName || accepterInfo.username;
      this.notificationsService.notifyChatRequestAccepted(
        senderUserId,
        displayName,
        client.userId,
        data.requestId,
        result.chatRoom._id.toString(),
      );
    } catch (error) {
      client.emit('error', {
        message: error.message || 'Failed to accept chat request',
      });
      this.logger.error('Accept chat request error:', error);
    }
  }

  @SubscribeMessage('rejectChatRequest')
  async handleRejectChatRequest(
    @MessageBody() data: { requestId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      const chatRequest = await this.chatService.rejectChatRequest(
        data.requestId,
        client.userId,
      );

      // Notify sender about the rejection
      this.server
        .to(`user_${chatRequest.sender.id}`)
        .emit('chatRequestRejected', chatRequest);

      // Confirm to receiver
      client.emit('chatRequestRejected', chatRequest);

      // Send push notification to the original sender
      const rejecterInfo = await this.userService.findById(client.userId);
      const displayName = rejecterInfo.firstName || rejecterInfo.username;
      this.notificationsService
        .notifyChatRequestRejected(
          chatRequest.sender.id.toString(),
          displayName,
          client.userId,
          data.requestId,
        )
        .catch((err) =>
          this.logger.error(
            { err, senderId: chatRequest.sender.id },
            '[Gateway] notifyChatRequestRejected failed',
          ),
        );
    } catch (error) {
      client.emit('error', {
        message: error.message || 'Failed to reject chat request',
      });
      this.logger.error('Reject chat request error:', error);
    }
  }

  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(
    @MessageBody() data: { messageId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      await this.chatService.markMessageAsRead(data.messageId, client.userId);

      // Notify sender that message was read
      const message = await this.chatService.getMessage(data.messageId);
      const senderSockets = this.userSockets.get(message.sender.id.toString());
      if (senderSockets) {
        senderSockets.forEach((socketId) => {
          this.server.to(socketId).emit('messageRead', {
            messageId: data.messageId,
            readBy: client.userId,
          });
        });
      }
    } catch (error) {
      this.logger.error('Mark as read error:', error);
    }
  }

  @SubscribeMessage('joinChatRoom')
  async handleJoinRoom(
    @MessageBody() data: { chatRoomId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.join(data.chatRoomId);
  }

  @SubscribeMessage('leaveChatRoom')
  async handleLeaveRoom(
    @MessageBody() data: { chatRoomId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.leave(data.chatRoomId);
  }

  private async authenticateSocket(socket: Socket): Promise<any> {
    let token =
      socket.handshake.auth.token || socket.handshake.headers.authorization;
    //remove bear from token if present
    if (token && token.startsWith('Bearer ')) {
      token = token.replace('Bearer ', '');
    }

    if (!token) return null;

    // Validate the token and extract user information
    try {
      const decodedToken = await this.authService.verifyToken(token);
      return decodedToken;
    } catch (error) {
      this.logger.warn({ error }, 'Token validation error');
      return null;
    }
  }
}
