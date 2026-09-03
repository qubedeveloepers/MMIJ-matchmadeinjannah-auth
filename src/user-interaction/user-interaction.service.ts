import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  UserInteraction,
  UserInteractionDocument,
  InteractionType,
} from './user-interaction.schema';
import { User } from 'src/users/user.schema';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class UserInteractionService {
  constructor(
    @InjectModel(UserInteraction.name)
    private userInteractionModel: Model<UserInteractionDocument>,
    @InjectModel('User')
    private userModel: Model<User>,
    @Inject(forwardRef(() => UsersService))
    private userService: UsersService,
  ) {}

  async saveProfile(
    userId: string,
    targetUserId: string,
  ): Promise<UserInteractionDocument> {
    if (userId === targetUserId) {
      throw new BadRequestException('mmij-24');
    }

    const targetUser = await this.userModel.findById(
      new Types.ObjectId(targetUserId),
    );
    if (!targetUser) {
      throw new NotFoundException('mmij-25');
    }

    const hasBlockedRelation = await this.checkBlockedRelation(
      userId,
      targetUserId,
    );
    if (hasBlockedRelation) {
      throw new BadRequestException('mmij-26');
    }

    try {
      const savedProfile = new this.userInteractionModel({
        userId: new Types.ObjectId(userId),
        targetUserId: new Types.ObjectId(targetUserId),
        interactionType: InteractionType.SAVED,
      });

      return await savedProfile.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('mmij-27');
      }
      throw error;
    }
  }

  async blockProfile(
    userId: string,
    targetUserId: string,
  ): Promise<UserInteractionDocument> {
    if (userId === targetUserId) {
      throw new BadRequestException('mmij-28');
    }

    const targetUser = await this.userModel.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundException('mmij-25');
    }

    // Remove any saved relationship before blocking
    await this.userInteractionModel.deleteOne({
      userId: new Types.ObjectId(userId),
      targetUserId: new Types.ObjectId(targetUserId),
      interactionType: InteractionType.SAVED,
    });

    try {
      const blockedProfile = new this.userInteractionModel({
        userId: new Types.ObjectId(userId),
        targetUserId: new Types.ObjectId(targetUserId),
        interactionType: InteractionType.BLOCKED,
      });

      return await blockedProfile.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('mmij-29');
      }
      throw error;
    }
  }

  async checkSavedProfile(
    userId: string,
    targetUserId: string,
  ): Promise<boolean> {
    const interaction = await this.userInteractionModel.findOne({
      userId: new Types.ObjectId(userId),
      targetUserId: new Types.ObjectId(targetUserId),
      interactionType: InteractionType.SAVED,
    });

    return !!interaction;
  }

  async unsaveProfile(userId: string, targetUserId: string): Promise<void> {
    const result = await this.userInteractionModel.deleteOne({
      userId: new Types.ObjectId(userId),
      targetUserId: new Types.ObjectId(targetUserId),
      interactionType: InteractionType.SAVED,
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('mmij-30');
    }
  }

  async unblockProfile(userId: string, targetUserId: string): Promise<void> {
    const result = await this.userInteractionModel.deleteOne({
      userId: new Types.ObjectId(userId),
      targetUserId: new Types.ObjectId(targetUserId),
      interactionType: InteractionType.BLOCKED,
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('mmij-31');
    }
  }

  async getSavedProfiles(userId: string): Promise<any> {
    const savedProfiles = await this.userInteractionModel
      .find({
        userId: new Types.ObjectId(userId),
        interactionType: InteractionType.SAVED,
      })
      .sort({ createdAt: -1 })
      .exec();

    const userIds = savedProfiles.map((profile) => profile.targetUserId);
    const users = await this.userModel.find({
      _id: { $in: userIds },
      isOnboarded: true,
    });
    // The user query filters on isOnboarded: true, so every result is
    // onboarded by construction.
    const usersWithOnboarded = users.map((profile) => ({
      ...profile.toObject(),
      isOnboarded: true,
    }));

    return usersWithOnboarded;
  }

  async getBlockedProfiles(userId: string): Promise<any> {
    const blockedProfiles = await this.userInteractionModel
      .find({
        userId: new Types.ObjectId(userId),
        interactionType: InteractionType.BLOCKED,
      })
      .sort({ createdAt: -1 })
      .exec();

    const userIds = blockedProfiles.map((profile) => profile.targetUserId);
    const users = await this.userModel.find({
      _id: { $in: userIds },
      isOnboarded: true,
    });
    // The user query filters on isOnboarded: true, so every result is
    // onboarded by construction.
    const usersWithOnboarded = users.map((profile) => ({
      ...profile.toObject(),
      isOnboarded: true,
    }));

    return usersWithOnboarded;
  }

  // Check if there's a blocked relationship between users
  async checkBlockedRelation(
    userId: string,
    targetUserId: string,
  ): Promise<boolean> {
    const blockedRelation = await this.userInteractionModel.findOne({
      $or: [
        {
          userId: new Types.ObjectId(userId),
          targetUserId: new Types.ObjectId(targetUserId),
          interactionType: InteractionType.BLOCKED,
        },
        {
          userId: new Types.ObjectId(targetUserId),
          targetUserId: new Types.ObjectId(userId),
          interactionType: InteractionType.BLOCKED,
        },
      ],
    });

    return !!blockedRelation;
  }

  async getExcludedUserIds(userId: string): Promise<Types.ObjectId[]> {
    const interactions = await this.userInteractionModel.find({
      $or: [
        // Users blocked by current user
        {
          userId: new Types.ObjectId(userId),
          interactionType: InteractionType.BLOCKED,
        },
        // Users who blocked current user
        {
          targetUserId: new Types.ObjectId(userId),
          interactionType: InteractionType.BLOCKED,
        },
      ],
    });

    return interactions.map((interaction) =>
      interaction.userId.toString() === userId
        ? interaction.targetUserId
        : interaction.userId,
    );
  }
}
