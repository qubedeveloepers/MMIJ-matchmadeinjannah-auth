import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { ChatRoom, ChatRoomDocument } from './chat-room.schema';
import {
  Message,
  MessageDocument,
  MessageStatus,
} from 'src/message/message.schema';
import { User, UserDocument } from 'src/users/user.schema';
import { QueryDto } from 'src/users/dtos/query.dto';
import { UsersService, transformFilter } from 'src/users/users.service';
import {
  ChatRequest,
  ChatRequestDocument,
  ChatRequestStatus,
} from 'src/chat-request/chat-request.schema';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ChatRoom.name) private chatRoomModel: Model<ChatRoomDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ChatRequest.name)
    private chatRequestModel: Model<ChatRequestDocument>,
    @Inject(UsersService) private userService: UsersService,
    @InjectPinoLogger(ChatService.name)
    private readonly logger: PinoLogger,
  ) {}

  async createChatRoom(
    userId1: string,
    userId2: string,
  ): Promise<ChatRoomDocument> {
    try {
      const existingRoom = await this.chatRoomModel.findOne({
        'participants.id': {
          $all: [new Types.ObjectId(userId1), new Types.ObjectId(userId2)],
        },
        isActive: true,
      });
      if (existingRoom) {
        return existingRoom;
      }

      const user1 = await this.userModel
        .findById(userId1)
        .select(
          'authType email username status dateOfBirth mobilePhone gender onBehalf isOnboarded firstName lastName',
        );

      const user2 = await this.userModel
        .findById(userId2)
        .select(
          'authType email username status dateOfBirth mobilePhone gender onBehalf isOnboarded firstName lastName',
        );
      if (!user2) {
        throw new NotFoundException('User not found');
      }

      const participant1 = {
        id: user1._id,
        email: user1.email,
        username: user1.username,
      };

      const participant2 = {
        id: user2._id,
        email: user2.email,
        username: user2.username,
      };

      const chatRoom = new this.chatRoomModel({
        participants: [participant1, participant2],
        lastActivity: new Date(),
      });

      return chatRoom.save();
    } catch (error) {
      this.logger.error(
        { error, userId1, userId2 },
        'Error creating chat room',
      );
      throw new NotFoundException('Error creating chat room');
    }
  }

  async getUserChatRooms(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);

    // Get chat rooms as before
    const chatRooms = await this.chatRoomModel
      .find({ 'participants.id': userObjectId, isActive: true })
      .populate('lastMessage')
      .populate('lastMessage.sender', 'id email username')
      .sort({ lastActivity: -1 })
      .exec();

    const rep = chatRooms.map((room) => room._id);

    // Get unread counts for all chat rooms in one query
    const unreadCounts = await this.messageModel.aggregate([
      {
        $match: {
          chatRoomId: { $in: chatRooms.map((room) => room._id.toString()) },
          'sender.id': { $ne: userObjectId },
          isDeleted: { $ne: true },
          'readBy.userId': { $ne: userObjectId },
        },
      },
      {
        $group: {
          _id: '$chatRoomId',
          unreadCount: { $sum: 1 },
        },
      },
    ]);

    // Create a map for quick lookup
    const unreadCountMap = unreadCounts.reduce((acc, item) => {
      acc[item._id.toString()] = item.unreadCount;
      return acc;
    }, {});

    // Add unread count to each chat room
    return chatRooms.map((room) => ({
      ...room.toObject(),
      unreadCount: unreadCountMap[room._id.toString()] || 0,
    }));
  }

  async getChatRoom(chatRoomId: string): Promise<ChatRoomDocument> {
    const chatRoom = await this.chatRoomModel
      .findById(chatRoomId)
      .populate('participants', 'firstName lastName username')
      .populate('lastMessage')
      .populate('lastMessage.sender', 'id email username')
      .exec();

    if (!chatRoom) {
      throw new NotFoundException('Chat room not found');
    }

    return chatRoom;
  }

  async createMessage(
    chatRoomId: string,
    senderId: string,
    content: string,
  ): Promise<MessageDocument> {
    // Verify user is participant in chat room
    this.logger.debug(
      { chatRoomId, senderId },
      'Inside create message service function',
    );
    const chatRoom = await this.getChatRoom(chatRoomId);

    if (!chatRoom.participants.some((p) => p.id.toString() === senderId)) {
      throw new ForbiddenException(
        'User is not a participant in this chat room',
      );
    }

    // match senderId with participants
    const sender = chatRoom.participants.find(
      (p) => p.id.toString() === senderId,
    );

    const message = new this.messageModel({
      chatRoomId: chatRoomId,
      sender: sender,
      content,
    });

    const savedMessage = await message.save();

    // Update chat room's last message and activity
    await this.chatRoomModel.findByIdAndUpdate(chatRoomId, {
      lastMessage: savedMessage._id,
      lastActivity: new Date(),
    });

    return (
      this.messageModel
        .findById(savedMessage._id)
        // .populate('senderId', 'firstName lastName username')
        .exec()
    );
  }

  async getChatMessages(
    chatRoomId: string,
    userId: string,
    searchDto: QueryDto,
  ): Promise<{ messages: MessageDocument[]; total: number; hasMore: boolean }> {
    // Verify user is participant

    const chatRoom = await this.getChatRoom(chatRoomId);

    transformFilter(searchDto);
    const { size, offset, orderby, filter } = searchDto;

    if (!chatRoom.participants.some((p) => p.id.toString() === userId)) {
      throw new ForbiddenException(
        'User is not a participant in this chat room',
      );
    }

    const [messages, total] = await Promise.all([
      this.messageModel
        .find({ chatRoomId: chatRoomId, isDeleted: false, ...filter })
        // .populate('sender', 'firstName lastName username')
        .sort(orderby)
        .skip(+offset)
        .limit(+size)
        .exec(),
      this.messageModel.countDocuments({
        chatRoom: chatRoomId,
        isDeleted: false,
        ...filter,
      }),
    ]);

    return {
      messages: messages.reverse(), // Reverse to get chronological order
      total,
      hasMore: offset + messages.length < total,
    };
  }

  async markMessageAsDelivered(
    messageId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<void> {
    await this.messageModel.findByIdAndUpdate(messageId, {
      status: MessageStatus.DELIVERED,
    });
  }

  async markMessageAsRead(messageId: string, userId: string): Promise<void> {
    await this.messageModel.findOneAndUpdate(
      {
        _id: messageId,
        'readBy.userId': { $ne: userId }, // Only update if user is not in readBy array
      },
      {
        status: MessageStatus.READ,
        $addToSet: {
          readBy: {
            userId: userId,
            readAt: new Date(),
          },
        },
      },
    );
  }

  async getMessage(messageId: string): Promise<MessageDocument> {
    return this.messageModel.findById(messageId).exec();
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await this.messageModel.findById(messageId);

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.sender.id.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    await this.messageModel.findByIdAndUpdate(messageId, {
      isDeleted: true,
      content: 'This message was deleted',
    });
  }

  // service functions for chat request feature

  // Check if users can chat directly (have existing chat room)
  async canUsersChat(userId1: string, userId2: string): Promise<boolean> {
    const existingRoom = await this.chatRoomModel.findOne({
      'participants.id': {
        $all: [new Types.ObjectId(userId1), new Types.ObjectId(userId2)],
      },
      isActive: true,
    });
    return !!existingRoom;
  }

  // Send chat request
  async sendChatRequest(
    senderId: string,
    receiverId: string,
    senderInfo: { email: string; username: string },
    message?: string,
    // receiverInfo: { email: string; username: string },
  ): Promise<ChatRequest> {
    // Check if users can already chat
    if (await this.canUsersChat(senderId, receiverId)) {
      throw new BadRequestException(
        'Chat room already exists between these users',
      );
    }
    // Get receiver info
    const receiverInfo = await this.userService.findById(receiverId);
    // Check if there's already a pending request
    const existingRequest = await this.chatRequestModel.findOne({
      $or: [
        {
          'sender.id': new Types.ObjectId(senderId),
          'receiver.id': new Types.ObjectId(receiverId),
        },
        {
          'sender.id': new Types.ObjectId(receiverId),
          'receiver.id': new Types.ObjectId(senderId),
        },
      ],
      status: ChatRequestStatus.PENDING,
      isActive: true,
    });

    if (existingRequest) {
      throw new BadRequestException(
        'A chat request already exists between these users',
      );
    }

    const chatRequest = new this.chatRequestModel({
      sender: {
        id: new Types.ObjectId(senderId),
        email: senderInfo.email,
        username: senderInfo.username,
      },
      receiver: {
        id: new Types.ObjectId(receiverId),
        email: receiverInfo.email,
        username: receiverInfo.username,
      },
      ...(message && { message }),
      status: ChatRequestStatus.PENDING,
    });

    return chatRequest.save();
  }

  // Get incoming chat requests for a user
  async getIncomingChatRequests(
    userId: string,
  ): Promise<(ChatRequest & { props?: any })[]> {
    const res = await this.chatRequestModel
      .find({
        'receiver.id': new Types.ObjectId(userId),
        status: ChatRequestStatus.PENDING,
        isActive: true,
      })
      .sort({ createdAt: -1 })
      .lean();

    // Add props to plain objects
    const results = await Promise.all(
      res.map(async (chatRequest) => {
        try {
          // Fetch sender details only
          const senderUser = await this.userService.findById(
            chatRequest.sender.id.toString(),
          );

          // Add props to the plain object
          return {
            ...chatRequest,
            props: {
              senderProfession: senderUser.profession,
              senderSect: senderUser.sect,
              senderDateOfBirth: senderUser.dateOfBirth,
              senderCurrentLocation: senderUser.currentLocation,
            },
          };
        } catch (err) {
          this.logger.warn(
            { error: err, chatRequestId: chatRequest._id },
            'Error fetching user details',
          );
          return chatRequest;
        }
      }),
    );

    return results;
  }

  // Get sent chat requests for a user
  async getSentChatRequests(userId: string): Promise<ChatRequest[]> {
    return this.chatRequestModel
      .find({
        'sender.id': new Types.ObjectId(userId),
        status: ChatRequestStatus.PENDING,
        isActive: true,
      })
      .sort({ createdAt: -1 });
  }

  // Accept chat request
  async acceptChatRequest(
    requestId: string,
    userId: string,
  ): Promise<{ chatRequest: ChatRequest; chatRoom: ChatRoom }> {
    const chatRequest = await this.chatRequestModel.findById(requestId);

    if (!chatRequest) {
      throw new NotFoundException('Chat request not found');
    }

    if (chatRequest.receiver.id.toString() !== userId) {
      throw new ForbiddenException('You can only accept requests sent to you');
    }

    if (chatRequest.status !== ChatRequestStatus.PENDING) {
      throw new BadRequestException(
        'This request has already been responded to',
      );
    }

    // Create chat room
    const chatRoom = await this.createChatRoom(
      chatRequest.sender.id.toString(),
      chatRequest.receiver.id.toString(),
    );

    // Update request status
    chatRequest.status = ChatRequestStatus.ACCEPTED;
    chatRequest.chatRoomId = chatRoom._id;
    chatRequest.respondedAt = new Date();
    await chatRequest.save();

    // Create the initial message in the chat room
    if (chatRequest.message) {
      await this.createMessage(
        chatRoom._id.toString(),
        chatRequest.sender.id.toString(),
        chatRequest.message,
      );
    }

    return { chatRequest, chatRoom };
  }

  // Reject chat request
  async rejectChatRequest(
    requestId: string,
    userId: string,
  ): Promise<ChatRequest> {
    const chatRequest = await this.chatRequestModel.findById(requestId);

    if (!chatRequest) {
      throw new NotFoundException('Chat request not found');
    }

    if (chatRequest.receiver.id.toString() !== userId) {
      throw new ForbiddenException('You can only reject requests sent to you');
    }

    if (chatRequest.status !== ChatRequestStatus.PENDING) {
      throw new BadRequestException(
        'This request has already been responded to',
      );
    }

    chatRequest.status = ChatRequestStatus.REJECTED;
    chatRequest.respondedAt = new Date();
    await chatRequest.save();

    return chatRequest;
  }

  async doesChatRequestExist(
    senderId: string,
    receiverId: string,
  ): Promise<boolean> {
    const existingRequest = await this.chatRequestModel.findOne({
      $or: [
        {
          'sender.id': new Types.ObjectId(senderId),
          'receiver.id': new Types.ObjectId(receiverId),
        },
        {
          'sender.id': new Types.ObjectId(receiverId),
          'receiver.id': new Types.ObjectId(senderId),
        },
      ],
      status: ChatRequestStatus.PENDING,
      isActive: true,
    });
    return !!existingRequest;
  }
}
