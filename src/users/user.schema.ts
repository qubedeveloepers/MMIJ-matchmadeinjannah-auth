import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { HydratedDocument } from 'mongoose';
import { AuthType } from './enums/authType.enum';
import { UserStatus } from './enums/userStatus.enum';
import { DeletionReason } from './enums/deletionReason.enum';
import { Role } from '../auth/enums/role.enum';
import { MediaApprovalStatus } from './enums/mediaApprovalStatus.enum';
import { MediaVisibility } from './enums/mediaVisibility.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
})
export class User extends Document {
  _id: Types.ObjectId;

  @Prop({ required: true })
  authType: AuthType[];

  @Prop([
    {
      authType: { type: String, enum: AuthType },
      externalId: String,
      createdAt: Date,
      updatedAt: Date,
    },
  ])
  accounts: {
    authType: AuthType;
    externalId: string;
    createdAt: Date;
    updatedAt: Date;
  }[];

  @Prop({ unique: [true, 'Email $value is already taken'] })
  email: string;

  @Prop()
  password: string;

  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true })
  status: UserStatus;

  @Prop({ type: String, enum: Role, default: Role.USER })
  role: Role;

  @Prop({ default: 'UTC' })
  timeZone: string;

  @Prop({ type: Date, required: true })
  dateOfBirth: Date;

  @Prop({ unique: true, sparse: true })
  mobilePhone: string;

  @Prop({ enum: ['Male', 'Female'], required: true })
  gender: string;

  @Prop({
    enum: [
      'Self',
      'Daughter/Son',
      'Sister',
      'Brother',
      'Friend',
      'Mother/Father',
      'Grandparent',
      'Aunt/Uncle',
      'Other',
    ],
    required: true,
  })
  onBehalf: string;

  // New profile fields
  // Education and Profession
  @Prop({
    enum: ['High School', 'Bachelors', 'Masters', 'Doctorate', 'Other'],
  })
  education: string;

  @Prop()
  profession: string;

  @Prop()
  jobTitle: string;

  // Location and Residency
  @Prop()
  birthplace: string;

  @Prop()
  raised: string;

  @Prop()
  currentLocation: string;

  @Prop()
  residenceStatus: string;

  // Physical attributes
  @Prop()
  height: string;

  @Prop()
  ethnicity: string;

  // Language
  @Prop()
  firstLanguage: string;

  // Marital information
  @Prop()
  maritalStatus: string;

  @Prop()
  likeToMarry: string;

  // Religious information
  @Prop()
  religiousPractice: string;

  @Prop()
  sect: string;

  @Prop({ type: Boolean })
  keepFast: boolean;

  @Prop({ type: Boolean })
  pray: boolean;

  @Prop()
  halalDiet: string;

  // Appearance preferences
  @Prop({ type: [String] })
  womenWear: string[];

  @Prop({ type: [String] })
  menWear: string[];

  @Prop({ type: [String] })
  preferWifeToWear: string[];

  @Prop({ type: [String] })
  preferHusbandToWear: string[];

  // Living arrangements
  @Prop()
  livingWith: string;

  @Prop({ type: Boolean })
  wantChildren: boolean;

  @Prop({ type: Boolean })
  haveChildren: boolean;

  @Prop()
  willingToRelocate: string;

  // Lifestyle
  @Prop()
  drinkAlcohol: string;

  @Prop()
  smoke: string;

  @Prop()
  disabilities: string;

  @Prop()
  exercise: string;

  // Personal interests
  @Prop({ type: [String] })
  hobbies: string[];

  @Prop({ type: [String] })
  interests: string[];

  // Religious background
  @Prop({ type: Boolean })
  isRevert: boolean;

  @Prop({ type: Boolean })
  isConvert: boolean;

  // Partner preferences
  @Prop()
  partnerSect: string;

  @Prop()
  partnerMaritalStatus: string;

  @Prop()
  partnerBirthplace: string;

  @Prop()
  partnerRaised: string;

  @Prop()
  partnerAge: string;

  @Prop()
  partnerHeight: string;

  @Prop()
  partnerEducation: string;

  @Prop()
  partnerResidenceStatus: string;

  @Prop()
  partnerEthnicity: string;

  @Prop()
  partnerLanguage: string;

  @Prop({ type: Boolean })
  partnerHaveChildren: boolean;

  @Prop()
  partnerCurrentLocation: string;

  // About me section
  @Prop()
  aboutMe: string;

  // Media fields - Cloudinary storage
  @Prop()
  profilePicture: string; // Cloudinary public_id for profile picture

  @Prop()
  profilePictureThumbnail: string; // base64 60×60 webp thumbnail for list views

  @Prop({
    type: String,
    enum: MediaApprovalStatus,
    default: MediaApprovalStatus.PENDING,
  })
  profilePictureStatus: MediaApprovalStatus;

  @Prop()
  profilePictureRejectionReason: string;

  @Prop([
    {
      id: { type: String },
      publicId: String, // Cloudinary public_id
      status: {
        type: String,
        enum: MediaApprovalStatus,
        default: MediaApprovalStatus.PENDING,
      },
      rejectionReason: String,
      uploadedAt: { type: Date, default: Date.now },
    },
  ])
  galleryPhotos: {
    id: string;
    publicId: string;
    status: MediaApprovalStatus;
    rejectionReason?: string;
    uploadedAt: Date;
  }[];

  @Prop()
  profileVideo: string; // Cloudinary public_id for profile video

  @Prop({
    type: String,
    enum: MediaApprovalStatus,
    default: MediaApprovalStatus.PENDING,
  })
  profileVideoStatus: MediaApprovalStatus;

  @Prop()
  profileVideoRejectionReason: string;

  // Media privacy toggles — control who can view each media field
  @Prop({
    type: String,
    enum: MediaVisibility,
    default: MediaVisibility.ALL_MEMBERS,
  })
  profilePictureVisibility: MediaVisibility;

  @Prop({
    type: String,
    enum: MediaVisibility,
    default: MediaVisibility.ONLY_ME,
  })
  galleryPhotosVisibility: MediaVisibility;

  @Prop({
    type: String,
    enum: MediaVisibility,
    default: MediaVisibility.ONLY_ME,
  })
  profileVideoVisibility: MediaVisibility;

  @Prop({ default: false })
  profileCompleteNotificationSent: boolean;

  @Prop({ type: Boolean, default: false, index: true })
  isOnboarded: boolean;

  // Set true when a social signup is created with sentinel default values
  // for dateOfBirth/gender/onBehalf. Flipped to false the first time the
  // user PATCHes all three together (the auth-completion screen submit).
  @Prop({ type: Boolean, default: false })
  requiresAuthCompletion: boolean;

  @Prop({ type: Date })
  deletedAt: Date;

  @Prop({ type: String, enum: DeletionReason })
  deletionReason: DeletionReason;

  @Prop({ type: String })
  banReason?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
