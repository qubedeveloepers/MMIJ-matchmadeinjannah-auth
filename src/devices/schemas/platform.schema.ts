import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { PlatformType } from '../constants';

@Schema({ _id: false })
export class Platform {
  @Prop({ required: true, enum: ['iOS', 'Android'] })
  @IsEnum(['iOS', 'Android'])
  platform: PlatformType;

  @Prop({ required: true })
  @IsString()
  name: string;

  @Prop()
  @IsOptional()
  @IsString()
  systemName?: string;

  @Prop({ required: true })
  @IsString()
  osVersion: string;

  @Prop()
  @IsOptional()
  @IsNumber()
  sdkInt?: number;

  @Prop({ required: true })
  @IsString()
  model: string;

  @Prop()
  @IsOptional()
  @IsString()
  modelName?: string;

  @Prop()
  @IsOptional()
  @IsString()
  brand?: string;

  @Prop()
  @IsOptional()
  @IsString()
  device?: string;

  @Prop()
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @Prop()
  @IsOptional()
  @IsString()
  identifierForVendor?: string;

  @Prop({ required: true })
  @IsBoolean()
  isPhysicalDevice: boolean;
}

export const PlatformSchema = SchemaFactory.createForClass(Platform);
