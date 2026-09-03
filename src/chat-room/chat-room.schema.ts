import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatRoomDocument = HydratedDocument<ChatRoom>;

@Schema({ _id: false })
export class ChatParticipant {
  @Prop({ type: Types.ObjectId, required: true })
  id: Types.ObjectId;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  username: string;

  // add dateOfBirth optional
  @Prop({ required: false })
  dateOfBirth?: Date;

  // add sect
  @Prop({ required: false })
  sect?: string;

  // add profession
  @Prop({ required: false })
  profession?: string;

  // current location
  @Prop({ required: false })
  currentLocation?: string;
}

export const ChatParticipantSchema =
  SchemaFactory.createForClass(ChatParticipant);

@Schema({
  timestamps: true,
})
export class ChatRoom extends Document {
  _id: Types.ObjectId;

  @Prop({ type: [ChatParticipantSchema], required: true })
  participants: ChatParticipant[];

  @Prop({ type: Types.ObjectId, ref: 'Message' })
  lastMessage: Types.ObjectId;

  @Prop({ default: Date.now })
  lastActivity: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [Types.ObjectId] })
  deletedParticipantIds: Types.ObjectId[];
}

export const ChatRoomSchema = SchemaFactory.createForClass(ChatRoom);
