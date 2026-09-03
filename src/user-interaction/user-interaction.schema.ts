import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HydratedDocument } from 'mongoose';

export type UserInteractionDocument = HydratedDocument<UserInteraction>;

export enum InteractionType {
  SAVED = 'saved',
  BLOCKED = 'blocked',
}

@Schema({
  timestamps: true,
})
export class UserInteraction extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId; // The user who performs the action

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  targetUserId: Types.ObjectId; // The user being saved/blocked

  @Prop({ enum: InteractionType, required: true })
  interactionType: InteractionType;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const UserInteractionSchema =
  SchemaFactory.createForClass(UserInteraction);

UserInteractionSchema.index(
  { userId: 1, targetUserId: 1, interactionType: 1 },
  { unique: true },
);
UserInteractionSchema.index({ userId: 1, interactionType: 1 });
UserInteractionSchema.index({ targetUserId: 1, interactionType: 1 });
