import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Platform, PlatformSchema } from './platform.schema';

export type DeviceDocument = Device & Document;

@Schema({ timestamps: true })
export class Device {
  // --- Top-level properties ---
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true })
  firebaseInstallationId: string;

  @Prop({ required: false })
  userId: string;

  @Prop({ required: true, unique: true })
  fcmToken: string;

  // --- Nested platform object ---

  @Prop({ required: true, type: PlatformSchema })
  platform: Platform;
}

const DeviceSchema = SchemaFactory.createForClass(Device);
DeviceSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 5184000 }); // 60 days

export { DeviceSchema };
