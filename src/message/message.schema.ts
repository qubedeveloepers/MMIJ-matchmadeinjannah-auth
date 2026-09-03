import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ChatParticipant,
  ChatParticipantSchema,
} from 'src/chat-room/chat-room.schema';

export type MessageDocument = HydratedDocument<Message>;

export enum MessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
}

@Schema({
  timestamps: true,
})
export class Message extends Document {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ChatRoom', required: true })
  chatRoomId: Types.ObjectId;

  @Prop({ type: ChatParticipantSchema, required: true })
  sender: ChatParticipant;

  @Prop({ required: true })
  content: string;

  @Prop({ enum: MessageStatus, default: MessageStatus.SENT })
  status: MessageStatus;

  @Prop({
    type: [{ userId: { type: Types.ObjectId, ref: 'User' }, readAt: Date }],
  })
  readBy: { userId: Types.ObjectId; readAt: Date }[];

  @Prop({ default: false })
  isDeleted: boolean;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
