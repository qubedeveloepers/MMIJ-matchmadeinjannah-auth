import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ChatParticipant,
  ChatParticipantSchema,
} from 'src/chat-room/chat-room.schema';

export type ChatRequestDocument = HydratedDocument<ChatRequest>;

export enum ChatRequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Schema({
  timestamps: true,
})
export class ChatRequest extends Document {
  _id: Types.ObjectId;

  @Prop({ type: ChatParticipantSchema, required: true })
  sender: ChatParticipant;

  @Prop({ type: ChatParticipantSchema, required: true })
  receiver: ChatParticipant;

  @Prop({ required: false })
  message: string; // Initial message from sender

  @Prop({ enum: ChatRequestStatus, default: ChatRequestStatus.PENDING })
  status: ChatRequestStatus;

  @Prop({ type: Types.ObjectId, ref: 'ChatRoom' })
  chatRoomId?: Types.ObjectId; // Set when request is accepted

  @Prop()
  respondedAt?: Date; // When request was accepted/rejected

  @Prop({ default: true })
  isActive: boolean;
}

export const ChatRequestSchema = SchemaFactory.createForClass(ChatRequest);

ChatRequestSchema.index({ 'sender.id': 1, 'receiver.id': 1 });
ChatRequestSchema.index({ 'receiver.id': 1, status: 1 });
ChatRequestSchema.index({ 'sender.id': 1, status: 1 });
