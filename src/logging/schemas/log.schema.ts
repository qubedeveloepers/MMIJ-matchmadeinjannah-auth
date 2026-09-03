import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type LogDocument = Log & Document;

@Schema()
export class Log {
  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop()
  role: string;

  @Prop({ required: true })
  action: string;

  @Prop({ type: [MongooseSchema.Types.Mixed], required: false })
  errorLogs?: any[];

  @Prop({ default: Date.now })
  timestamp: Date;
}

export const LogSchema = SchemaFactory.createForClass(Log);
