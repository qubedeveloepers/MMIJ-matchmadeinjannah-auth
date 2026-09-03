import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { UpdateProfileDto } from './dtos/profile.dto';
import { UpdateMediaPrivacyDto } from './dtos/mediaPrivacy.dto';
import { QueryDto } from './dtos/query.dto';
import { User } from './user.schema';
import { UserInteraction } from 'src/user-interaction/user-interaction.schema';
import { UserInteractionService } from 'src/user-interaction/user-interaction.service';
import { UserStatus } from './enums/userStatus.enum';
import { DeletionReason } from './enums/deletionReason.enum';
import { AuthType } from './enums/authType.enum';
import { Role } from '../auth/enums/role.enum';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { MediaApprovalStatus } from './enums/mediaApprovalStatus.enum';
import { MediaVisibility } from './enums/mediaVisibility.enum';
import { NotificationsService } from 'src/notifications/notifications.service';
import { Device } from 'src/devices/schemas/device.schema';
import { ChatRequest } from 'src/chat-request/chat-request.schema';
import { ChatRoom } from 'src/chat-room/chat-room.schema';
import { Message } from 'src/message/message.schema';
import {
  isUsernameReserved,
  isUsernameProfane,
} from 'src/utils/username-validation';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Device.name) private deviceModel: Model<Device>,
    @InjectModel(UserInteraction.name)
    private userInteractionModel: Model<UserInteraction>,
    @InjectModel(ChatRequest.name) private chatRequestModel: Model<ChatRequest>,
    @InjectModel(ChatRoom.name) private chatRoomModel: Model<ChatRoom>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    private userInteractionService: UserInteractionService,
    private cloudinaryService: CloudinaryService,
    private notificationsService: NotificationsService,
    @InjectPinoLogger(UsersService.name)
    private readonly logger: PinoLogger,
  ) {}

  async saveUser(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    username: string;
    dateOfBirth: Date;
    mobilePhone: string;
    gender: string;
    onBehalf: string;
    status: string;
    timeZone: string;
    authType: string[];
  }) {
    const user = await this.userModel.create(userData);
    return user.save();
  }

  async deletePendingUserById(userId: string): Promise<boolean> {
    const result = await this.userModel
      .deleteOne({
        _id: userId,
        status: UserStatus.PENDING,
      })
      .exec();

    return result.deletedCount === 1;
  }

  async createUser(userData: {
    email: string;
    firstName: string;
    lastName: string;
    username: string;
    profilePicture?: string;
    status: UserStatus;
    authType: string[];
    accounts: {
      authType: AuthType;
      externalId: any;
      createdAt: Date;
      updatedAt: Date;
    }[];
  }) {
    const user = await this.userModel.create(userData);
    return user.save();
  }

  async findOne(email: string): Promise<User | undefined> {
    try {
      return await this.userModel
        .findOne({
          email: email?.toLowerCase(),
        })
        .exec();
    } catch (error) {
      throw new InternalServerErrorException('mmij-02');
    }
  }

  async findByExternalId(
    authType: AuthType,
    externalId: string,
  ): Promise<User | undefined> {
    try {
      return await this.userModel
        .findOne({
          accounts: { $elemMatch: { authType, externalId } },
        })
        .exec();
    } catch (error) {
      throw new InternalServerErrorException('mmij-02');
    }
  }

  async findOneByUsername(username: string): Promise<User | undefined> {
    try {
      return await this.userModel
        .findOne({
          username: username,
        })
        .exec();
    } catch (e) {
      throw new BadRequestException('mmij-21');
    }
  }

  async findOneAndLean(email: string): Promise<User | undefined> {
    try {
      return await this.userModel
        .findOne({
          email: email?.toLowerCase(),
        })
        .lean()
        .exec();
    } catch (error) {
      throw new UnauthorizedException('mmij-02');
    }
  }

  // find user by id
  async findById(userId: string): Promise<User | undefined> {
    try {
      return await this.userModel.findById(userId).exec();
    } catch (error) {
      throw new UnauthorizedException('mmij-02');
    }
  }

  /**
   * Atomically flip a user to ACTIVE and ensure LOCAL is in their authType
   * array. Used by the signup-verification flow to avoid the two-write
   * window where authType is updated but status is still PENDING.
   */
  async activateAndAddLocalAuth(email: string): Promise<void> {
    const result = await this.userModel
      .updateOne(
        { email: email.toLowerCase() },
        {
          $set: { status: UserStatus.ACTIVE },
          $addToSet: { authType: AuthType.LOCAL },
        },
      )
      .exec();

    if (result.matchedCount === 0) {
      throw new NotFoundException('mmij-04');
    }
  }

  /**
   * Merge or create a user from a verified OAuth profile. Returns the user
   * document plus a `newlyLinked` flag indicating whether the OAuth provider
   * was added to an existing account (so the caller can send a notification).
   *
   * Behavior:
   *  - No user with this email: create ACTIVE user with the OAuth provider.
   *  - DELETED user: caller-handled (we throw via the read step).
   *  - PENDING user (unverified local signup): treat the local password as
   *    untrusted (email was never verified by us). Replace authType with the
   *    OAuth provider, wipe the password, overwrite name fields from the
   *    OAuth profile, flip to ACTIVE.
   *  - ACTIVE user: add the OAuth provider to authType (idempotent), push the
   *    account record if not already present.
   *
   * All writes use atomic operators so concurrent sign-ins are race-safe.
   */
  async linkSocialOrCreate(
    authType: AuthType,
    profile: {
      email: string;
      externalId: string;
      firstName?: string;
      lastName?: string;
    },
    generateUsername: () => Promise<string>,
  ): Promise<{ user: User; newlyLinked: boolean; justCreated: boolean }> {
    const email = profile.email.toLowerCase();
    const now = new Date();

    const existing = await this.userModel.findOne({ email }).exec();

    if (existing && existing.status === UserStatus.DELETED) {
      throw new UnauthorizedException('mmij-banned');
    }

    if (!existing) {
      const username = await generateUsername();
      try {
        const created = await this.userModel.create({
          email,
          firstName: profile.firstName || '',
          lastName: profile.lastName || '',
          username,
          status: UserStatus.ACTIVE,
          timeZone: 'UTC',
          authType: [authType],
          // Sentinel placeholders for fields OAuth providers don't supply.
          // The user replaces these on the auth-complete screen; until then
          // the requiresAuthCompletion flag routes them to that screen, and
          // the isOnboarded gate keeps them out of discovery queries so
          // other users never see these defaults.
          dateOfBirth: new Date('1970-01-01T00:00:00Z'),
          gender: 'Female',
          onBehalf: 'Self',
          requiresAuthCompletion: true,
          accounts: [
            {
              authType,
              externalId: profile.externalId,
              createdAt: now,
              updatedAt: now,
            },
          ],
        });
        return { user: created, newlyLinked: false, justCreated: true };
      } catch (error: any) {
        if (error?.code === 11000) {
          // Lost the create race against a concurrent signin — fall through to merge.
          const racedUser = await this.userModel.findOne({ email }).exec();
          if (racedUser) {
            const merged = await this.applySocialMerge(
              racedUser,
              authType,
              profile,
              now,
            );
            return { ...merged, justCreated: false };
          }
        }
        throw error;
      }
    }

    const merged = await this.applySocialMerge(
      existing,
      authType,
      profile,
      now,
    );
    return { ...merged, justCreated: false };
  }

  private async applySocialMerge(
    user: User,
    authType: AuthType,
    profile: { externalId: string; firstName?: string; lastName?: string },
    now: Date,
  ): Promise<{ user: User; newlyLinked: boolean }> {
    const alreadyLinked = (user.authType || []).includes(authType);

    if (user.status === UserStatus.PENDING) {
      // Unverified local signup — the existing password has no proven owner.
      // Replace authType with the OAuth provider, wipe password, overwrite
      // basic identity fields from the OAuth profile, flip to ACTIVE.
      await this.userModel
        .updateOne(
          { _id: user._id, status: UserStatus.PENDING },
          {
            $set: {
              status: UserStatus.ACTIVE,
              password: null,
              authType: [authType],
              firstName: profile.firstName || '',
              lastName: profile.lastName || '',
            },
            $pull: { accounts: { authType: AuthType.LOCAL } },
          },
        )
        .exec();

      await this.userModel
        .updateOne(
          {
            _id: user._id,
            accounts: {
              $not: {
                $elemMatch: { authType, externalId: profile.externalId },
              },
            },
          },
          {
            $push: {
              accounts: {
                authType,
                externalId: profile.externalId,
                createdAt: now,
                updatedAt: now,
              },
            },
          },
        )
        .exec();
    } else {
      // ACTIVE — preserve existing auth methods, add this one if new.
      if (!alreadyLinked) {
        await this.userModel
          .updateOne({ _id: user._id }, { $addToSet: { authType } })
          .exec();
      }

      await this.userModel
        .updateOne(
          {
            _id: user._id,
            accounts: {
              $not: {
                $elemMatch: { authType, externalId: profile.externalId },
              },
            },
          },
          {
            $push: {
              accounts: {
                authType,
                externalId: profile.externalId,
                createdAt: now,
                updatedAt: now,
              },
            },
          },
        )
        .exec();
    }

    const refreshed = await this.userModel.findById(user._id).exec();
    return { user: refreshed, newlyLinked: !alreadyLinked };
  }

  // set user with email status to ACTIVE
  async setUserStatus(email: string, status: string) {
    try {
      const result = await this.userModel
        .updateOne({ email: email.toLowerCase() }, { status: status })
        .exec();

      if (result.matchedCount === 0) {
        throw new NotFoundException(
          `User with email ${email.toLowerCase()} does not exist`,
        );
      }

      return {
        message: `User is ACTIVE`,
      };
    } catch (error) {
      throw new InternalServerErrorException('mmij-13');
    }
  }

  async getProfile(
    userId: string,
    viewerUserId: string,
  ): Promise<User & { isOnboarded: boolean }> {
    const excludedUserIds =
      await this.userInteractionService.getExcludedUserIds(userId);

    const user: User = await this.userModel
      .findOne({
        $and: [
          { _id: userId },
          { _id: { $nin: excludedUserIds } },
          { role: { $ne: Role.ADMIN } },
          { status: { $ne: UserStatus.DELETED } },
          // Allow self-view regardless of onboarding state so a user
          // can always load their own profile (needed to drive the
          // onboarding flow). Block fetching not-yet-onboarded users
          // by id from other viewers.
          {
            $or: [
              { _id: new Types.ObjectId(viewerUserId) },
              { isOnboarded: true },
            ],
          },
        ],
      })
      .lean()
      .exec();

    const isSelf = viewerUserId === userId;
    const canSeePicture =
      isSelf ||
      resolveVisibility(user.profilePictureVisibility, 'profilePicture') ===
        MediaVisibility.ALL_MEMBERS;
    const canSeeGallery =
      isSelf ||
      resolveVisibility(user.galleryPhotosVisibility, 'galleryPhotos') ===
        MediaVisibility.ALL_MEMBERS;
    const canSeeVideo =
      isSelf ||
      resolveVisibility(user.profileVideoVisibility, 'profileVideo') ===
        MediaVisibility.ALL_MEMBERS;

    // Fetch profile picture from Cloudinary as base64 (only if APPROVED and visible to viewer)
    let profilePictureBase64: string | null = null;
    if (
      canSeePicture &&
      user.profilePicture &&
      user.profilePictureStatus === MediaApprovalStatus.APPROVED
    ) {
      try {
        profilePictureBase64 = await this.cloudinaryService.getAssetAsBase64(
          user.profilePicture,
          'image',
        );
      } catch (error) {
        this.logger.warn(
          { error, userId: user._id },
          'Error fetching profile picture from Cloudinary',
        );
        // Continue without profile picture if there's an error
      }
    }

    // Filter gallery photos to only include APPROVED ones and fetch as base64
    let approvedGalleryPhotos: Array<{
      id: string;
      publicId: string;
      status: MediaApprovalStatus;
      rejectionReason?: string;
      data: string;
      uploadedAt: Date;
    }> = [];
    if (canSeeGallery && user.galleryPhotos?.length) {
      const approved = user.galleryPhotos.filter(
        (photo) => photo.status === MediaApprovalStatus.APPROVED,
      );
      approvedGalleryPhotos = await Promise.all(
        approved.map(async (photo) => {
          try {
            const data = await this.cloudinaryService.getAssetAsBase64(
              photo.publicId,
              'image',
            );
            return {
              id: photo.id,
              publicId: photo.publicId,
              status: photo.status,
              rejectionReason: photo.rejectionReason,
              data,
              uploadedAt: photo.uploadedAt,
            };
          } catch (error) {
            this.logger.warn(
              { error, userId: user._id, photoId: photo.publicId },
              'Error fetching gallery photo from Cloudinary',
            );
            return null;
          }
        }),
      ).then((results) => results.filter((r) => r !== null));
    }

    // Fetch profile video from Cloudinary as base64 (only if APPROVED and visible to viewer)
    let profileVideoBase64: string | null = null;
    if (
      canSeeVideo &&
      user.profileVideo &&
      user.profileVideoStatus === MediaApprovalStatus.APPROVED
    ) {
      try {
        profileVideoBase64 = await this.cloudinaryService.getAssetAsBase64(
          user.profileVideo,
          'video',
        );
      } catch (error) {
        this.logger.warn(
          { error, userId: user._id },
          'Error fetching profile video from Cloudinary',
        );
        // Continue without profile video if there's an error
      }
    }

    return {
      ...user,
      isOnboarded: !!user.isOnboarded,
      requiresAuthCompletion: !!user.requiresAuthCompletion,
      profilePicture: profilePictureBase64,
      galleryPhotos: approvedGalleryPhotos,
      profileVideo: profileVideoBase64,
    } as unknown as User & { isOnboarded: boolean };
  }

  async updateMediaPrivacy(
    userId: string,
    dto: UpdateMediaPrivacyDto,
  ): Promise<User & { isOnboarded: boolean }> {
    const update: Partial<
      Record<keyof UpdateMediaPrivacyDto, MediaVisibility>
    > = {};
    if (dto.profilePictureVisibility !== undefined) {
      update.profilePictureVisibility = dto.profilePictureVisibility;
    }
    if (dto.galleryPhotosVisibility !== undefined) {
      update.galleryPhotosVisibility = dto.galleryPhotosVisibility;
    }
    if (dto.profileVideoVisibility !== undefined) {
      update.profileVideoVisibility = dto.profileVideoVisibility;
    }

    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: update }, { new: true })
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException('mmij-25');
    }

    return {
      ...user,
      isOnboarded: !!user.isOnboarded,
      requiresAuthCompletion: !!user.requiresAuthCompletion,
    } as unknown as User & {
      isOnboarded: boolean;
    };
  }

  async updateProfile(
    userId: string,
    profileData: UpdateProfileDto,
  ): Promise<User & { isOnboarded: boolean; requiresAuthCompletion: boolean }> {
    // If this user is still in the auth-complete state, require all three
    // identity fields in the same PATCH. Anything less would leave the
    // sentinel placeholders intact and silently exit the auth-complete
    // routing state.
    const current = await this.userModel
      .findById(userId)
      .select('requiresAuthCompletion')
      .lean();
    if (current?.requiresAuthCompletion) {
      const missing = (['dateOfBirth', 'gender', 'onBehalf'] as const).filter(
        (k) => profileData[k] === undefined,
      );
      if (missing.length > 0) {
        throw new BadRequestException('mmij-39');
      }
    }

    const user: User = await this.userModel
      .findByIdAndUpdate(userId, { $set: profileData }, { new: true })
      .lean()
      .exec();

    // Recompute onboarding status against the post-update document so
    // discovery/listing queries can filter on a stored boolean without
    // recomputing per row.
    const { isOnboarded } = await this.getProfileCompletionStatus(userId);

    // Persist unconditionally so the flag also drops back to false if a
    // user clears a previously-required field.
    const sentAllAuthCompleteFields =
      profileData.dateOfBirth !== undefined &&
      profileData.gender !== undefined &&
      profileData.onBehalf !== undefined;

    await this.userModel
      .updateOne(
        { _id: userId },
        {
          $set: {
            isOnboarded,
            // Only clear the auth-completion flag when the user submits all
            // three identity fields together — a partial PATCH must leave
            // the flag in place so the next signin still routes to the
            // auth-complete screen.
            ...(sentAllAuthCompleteFields
              ? { requiresAuthCompletion: false }
              : {}),
          },
        },
      )
      .exec();

    if (isOnboarded) {
      this.notificationsService
        .notifyProfileComplete(userId)
        .catch((err) =>
          this.logger.error(
            { err, userId },
            '[UsersService] notifyProfileComplete failed',
          ),
        );
    }

    return {
      ...user,
      isOnboarded,
      requiresAuthCompletion: sentAllAuthCompleteFields
        ? false
        : !!user.requiresAuthCompletion,
    } as unknown as User & {
      isOnboarded: boolean;
      requiresAuthCompletion: boolean;
    };
  }

  async getProfileCompletionStatus(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException('mmij-25');
    }

    // Calculate completion percentages for different sections
    const basicProfileFields = [
      'education',
      'profession',
      'jobTitle',
      'birthplace',
      'raised',
      'height',
      'ethnicity',
      'firstLanguage',
      'maritalStatus',
      'currentLocation',
      'residenceStatus',
    ];

    const religiousFields = [
      'religiousPractice',
      'sect',
      'keepFast',
      'pray',
      'halalDiet',
      'womenWear',
      'menWear',
      'preferWifeToWear',
      'preferHusbandToWear',
      'isRevert',
      'isConvert',
    ];

    const lifestyleFields = [
      'livingWith',
      'wantChildren',
      'haveChildren',
      'willingToRelocate',
      'drinkAlcohol',
      'smoke',
      'disabilities',
      'exercise',
      'hobbies',
      'interests',
    ];

    const partnerFields = [
      'partnerSect',
      'partnerMaritalStatus',
      'partnerBirthplace',
      'partnerRaised',
      'partnerAge',
      'partnerHeight',
      'partnerEducation',
      'partnerResidenceStatus',
      'partnerEthnicity',
      'partnerLanguage',
      'partnerHaveChildren',
    ];

    // Count filled fields
    const calcCompletion = (fields) => {
      let filled = 0;
      fields.forEach((field) => {
        if (
          user[field] !== undefined &&
          user[field] !== null &&
          user[field] !== ''
        ) {
          filled++;
        }
      });
      return Math.round((filled / fields.length) * 100);
    };

    return {
      personalProfile: calcCompletion(basicProfileFields),
      religiousProfile: calcCompletion(religiousFields),
      personalityDetails: calcCompletion(lifestyleFields),
      introduction: user.aboutMe ? 100 : 0,
      partnerExpectations: calcCompletion(partnerFields),
      overall: Math.round(
        (calcCompletion(basicProfileFields) +
          calcCompletion(religiousFields) +
          calcCompletion(lifestyleFields) +
          (user.aboutMe ? 100 : 0) +
          calcCompletion(partnerFields)) /
          5,
      ),
      isOnboarded:
        calcCompletion(basicProfileFields) === 100 &&
        calcCompletion(religiousFields) === 100 &&
        calcCompletion(lifestyleFields) === 100 &&
        (user.aboutMe ? 100 : 0) === 100 &&
        calcCompletion(partnerFields) === 100,
    };
  }

  async searchProfiles(currentUser: any, searchDto: QueryDto) {
    transformFilter(searchDto);
    const { size, offset, orderby, filter } = searchDto;

    const excludedUserIds =
      await this.userInteractionService.getExcludedUserIds(currentUser.userId);

    excludedUserIds.push(new Types.ObjectId(currentUser.userId));

    const user = await this.userModel
      .findById(currentUser.userId)
      .select('gender isOnboarded')
      .lean();

    // Block users who haven't completed onboarding from browsing the
    // discovery feed. Funnel them into the onboarding flow instead.
    if (!user?.isOnboarded) {
      throw new ForbiddenException('mmij-38');
    }

    const oppositeGender = user.gender === 'Male' ? 'Female' : 'Male';
    const genderFilter = { gender: oppositeGender };

    const deletedFilter = { status: { $ne: UserStatus.DELETED } };
    const onboardedFilter = { isOnboarded: true };
    const profiles = await this.userModel
      .find(
        filter
          ? {
              $and: [
                filter,
                genderFilter,
                { _id: { $nin: excludedUserIds } },
                { role: { $ne: Role.ADMIN } },
                deletedFilter,
                onboardedFilter,
              ],
            }
          : {
              $and: [
                genderFilter,
                { _id: { $nin: excludedUserIds } },
                { role: { $ne: Role.ADMIN } },
                deletedFilter,
                onboardedFilter,
              ],
            },
      )
      .select(
        'memberId gender age profession currentLocation sect onBehalf status dateOfBirth authType email username mobilePhone profilePicture profilePictureStatus profilePictureVisibility _id',
      )
      .sort(orderby)
      .skip(+offset)
      .limit(+size)
      .lean();

    const profilesWithAgeAndPicture = await Promise.all(
      profiles.map(async (profile) => {
        const age = this.calculateAge(profile.dateOfBirth);

        // Fetch profile picture from Cloudinary as base64 (only if APPROVED
        // and the owner's privacy toggle allows other members to see it).
        let profilePictureBase64: string | null = null;
        const pictureVisibility = resolveVisibility(
          profile.profilePictureVisibility,
          'profilePicture',
        );
        if (
          profile.profilePicture &&
          profile.profilePictureStatus === MediaApprovalStatus.APPROVED &&
          pictureVisibility === MediaVisibility.ALL_MEMBERS
        ) {
          try {
            profilePictureBase64 =
              await this.cloudinaryService.getAssetAsBase64(
                profile.profilePicture,
                'image',
              );
          } catch (error) {
            this.logger.warn(
              { error, userId: profile._id },
              'Error fetching profile picture from Cloudinary',
            );
            // Continue without profile picture if there's an error
          }
        }

        return {
          ...profile,
          age,
          // The query filters on isOnboarded: true, so every row here is
          // onboarded by construction.
          isOnboarded: true,
          profilePicture: profilePictureBase64,
        };
      }),
    );

    // const total = await this.userModel.countDocuments(filter);

    // if we want to return pagination details
    // {
    //   profiles: profilesWithAgeAndPicture,
    //   pagination: {
    //     total,
    //     offset,
    //     size,
    //     page: Math.ceil(offset / size) + 1,
    //   },
    // };

    return profilesWithAgeAndPicture;
  }

  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();

    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  private async generateUsernameSuggestions(
    baseUsername: string,
  ): Promise<string[]> {
    const suggestions: string[] = [];
    const MAX_ATTEMPTS = 5;

    let attempt = 0;
    while (suggestions.length < 2 && attempt < MAX_ATTEMPTS) {
      const randomNum = Math.floor(Math.random() * 10000);
      const newUsername = `${baseUsername}${randomNum}`;
      const exists = await this.userModel
        .exists({ username: newUsername })
        .exec();

      if (!exists) {
        suggestions.push(newUsername);
      }

      attempt++;
    }

    return suggestions;
  }

  async checkUsernameExists(
    username: string,
  ): Promise<{ exists: boolean; suggestions?: string[] }> {
    if (isUsernameReserved(username) || isUsernameProfane(username)) {
      throw new BadRequestException('mmij-36');
    }

    const user = await this.userModel
      .exists({ username: username?.toLowerCase() })
      .exec();
    if (user) {
      const suggestions = await this.generateUsernameSuggestions(
        username?.toLowerCase(),
      );
      return { exists: true, suggestions };
    }

    return { exists: false };
  }

  async deleteAccount(
    userId: string,
    deletionReason: DeletionReason = DeletionReason.USER_REQUESTED,
  ): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 1. Delete Cloudinary media assets
    try {
      if (user.profilePicture) {
        await this.cloudinaryService.deleteAsset(user.profilePicture, 'image');
      }
      if (user.galleryPhotos?.length) {
        await Promise.all(
          user.galleryPhotos.map((photo) =>
            this.cloudinaryService.deleteAsset(photo.publicId, 'image'),
          ),
        );
      }
      if (user.profileVideo) {
        await this.cloudinaryService.deleteAsset(user.profileVideo, 'video');
      }
    } catch (error) {
      this.logger.warn(
        { error, userId },
        '[deleteAccount] Error deleting Cloudinary assets',
      );
    }

    // 2. Delete device registrations (stops push notifications)
    await this.deviceModel.deleteMany({ userId }).exec();

    // 3. Delete user interactions in both directions (saves, blocks)
    const userObjectId = new Types.ObjectId(userId);
    await this.userInteractionModel
      .deleteMany({
        $or: [{ userId: userObjectId }, { targetUserId: userObjectId }],
      })
      .exec();

    // 4. Delete chat requests in both directions
    await this.chatRequestModel
      .deleteMany({
        $or: [{ 'sender.id': userObjectId }, { 'receiver.id': userObjectId }],
      })
      .exec();

    // 5. Remove deleted user from chat room participants and record the ID
    await this.chatRoomModel
      .updateMany(
        { 'participants.id': userObjectId },
        {
          $pull: { participants: { id: userObjectId } },
          $addToSet: { deletedParticipantIds: userObjectId },
        },
      )
      .exec();

    // 6. Anonymise messages sent by the deleted user; remove from readBy arrays
    await this.messageModel
      .updateMany(
        { 'sender.id': userObjectId },
        {
          $set: {
            'sender.username': 'Deleted User',
            'sender.email': '',
            'sender.dateOfBirth': null,
            'sender.sect': null,
            'sender.profession': null,
            'sender.currentLocation': null,
          },
        },
      )
      .exec();

    await this.messageModel
      .updateMany(
        { 'readBy.userId': userObjectId },
        { $pull: { readBy: { userId: userObjectId } } },
      )
      .exec();

    // 7. Soft-delete the user document: scrub PII, retain tombstone fields
    await this.userModel
      .findByIdAndUpdate(userId, {
        $set: {
          status: UserStatus.DELETED,
          deletedAt: new Date(),
          deletionReason,
          password: null,
          firstName: null,
          lastName: null,
          mobilePhone: null,
          dateOfBirth: null,
          gender: null,
          onBehalf: null,
          timeZone: null,
          authType: [],
          accounts: [],
          education: null,
          profession: null,
          jobTitle: null,
          birthplace: null,
          raised: null,
          currentLocation: null,
          residenceStatus: null,
          height: null,
          ethnicity: null,
          firstLanguage: null,
          maritalStatus: null,
          likeToMarry: null,
          religiousPractice: null,
          sect: null,
          keepFast: null,
          pray: null,
          halalDiet: null,
          womenWear: [],
          menWear: [],
          preferWifeToWear: [],
          preferHusbandToWear: [],
          livingWith: null,
          wantChildren: null,
          haveChildren: null,
          willingToRelocate: null,
          drinkAlcohol: null,
          smoke: null,
          disabilities: null,
          exercise: null,
          hobbies: [],
          interests: [],
          isRevert: null,
          isConvert: null,
          partnerSect: null,
          partnerMaritalStatus: null,
          partnerBirthplace: null,
          partnerRaised: null,
          partnerAge: null,
          partnerHeight: null,
          partnerEducation: null,
          partnerResidenceStatus: null,
          partnerEthnicity: null,
          partnerLanguage: null,
          partnerHaveChildren: null,
          partnerCurrentLocation: null,
          aboutMe: null,
          profilePicture: null,
          profilePictureStatus: null,
          profilePictureRejectionReason: null,
          galleryPhotos: [],
          profileVideo: null,
          profileVideoStatus: null,
          profileVideoRejectionReason: null,
          profilePictureVisibility: null,
          galleryPhotosVisibility: null,
          profileVideoVisibility: null,
          profileCompleteNotificationSent: false,
        },
      })
      .exec();

    this.logger.info(
      { userId, deletionReason },
      '[deleteAccount] Account deleted',
    );

    return { message: 'Account deleted' };
  }

  async getAllUsers(): Promise<User[]> {
    try {
      return await this.userModel.find().select('-password').lean().exec();
    } catch (error) {
      throw new InternalServerErrorException('mmij-13');
    }
  }
}

export function handleNullValues(
  criteria: any,
  nullValue: any,
  fields: string[],
) {
  for (const [key, value] of Object.entries(criteria)) {
    if (fields.includes(key)) {
      if (value === null) {
        criteria['$or'] = [{ [key]: null }, { [key]: nullValue }];
        delete criteria[key];
      } else if (JSON.stringify(value) === JSON.stringify({ $ne: null })) {
        criteria['$and'] = [
          { [key]: { $ne: null } },
          { [key]: { $ne: nullValue } },
        ];
        delete criteria[key];
      }
    } else if (value !== null && typeof value === 'object') {
      handleNullValues(value, nullValue, fields);
    }
  }
}

// Resolve a user's stored visibility for a media field, falling back to the
// schema default for legacy documents that pre-date the privacy toggle feature.
const VISIBILITY_DEFAULTS = {
  profilePicture: MediaVisibility.ALL_MEMBERS,
  galleryPhotos: MediaVisibility.ONLY_ME,
  profileVideo: MediaVisibility.ONLY_ME,
} as const;

function resolveVisibility(
  stored: MediaVisibility | undefined,
  field: keyof typeof VISIBILITY_DEFAULTS,
): MediaVisibility {
  return stored ?? VISIBILITY_DEFAULTS[field];
}

export function transformFilter(query: QueryDto) {
  handleNullValues(
    query.filter,
    [],
    [
      'hobbies',
      'interests',
      'womenWear',
      'menWear',
      'preferWifeToWear',
      'preferHusbandToWear',
    ],
  );
}
