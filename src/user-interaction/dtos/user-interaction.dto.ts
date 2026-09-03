import { IsNotEmpty, IsString, IsMongoId } from 'class-validator';
import { InteractionType } from '../user-interaction.schema';

export class SaveProfileDto {
  @IsNotEmpty()
  @IsString()
  @IsMongoId()
  targetUserId: string;
}

export class BlockProfileDto {
  @IsNotEmpty()
  @IsString()
  @IsMongoId()
  targetUserId: string;
}

export class UserInteractionResponseDto {
  id: string;
  userId: string;
  targetUserId: string;
  interactionType: InteractionType;
  targetUser?: {
    _id: string;
    firstName: string;
    lastName: string;
    username: string;
  };
  createdAt: Date;
}
