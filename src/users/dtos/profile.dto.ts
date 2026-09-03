import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateProfileDto {
  // Basic profile
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  // Auth-complete fields — initially populated with sentinel placeholders
  // for social signups; users replace them via the auth-complete screen.
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dateOfBirth?: Date;

  @IsOptional()
  @IsEnum(['Male', 'Female'], { message: 'Invalid value for Gender' })
  gender?: string;

  @IsOptional()
  @IsEnum(
    [
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
    { message: 'Invalid value for OnBehalf' },
  )
  onBehalf?: string;

  @IsOptional()
  @IsEnum(['High School', 'Bachelors', 'Masters', 'Doctorate', 'Other'], {
    message: 'Invalid value for Education',
  })
  education?: string;

  @IsOptional()
  @IsString()
  profession?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  birthplace?: string;

  @IsOptional()
  @IsString()
  raised?: string;

  @IsOptional()
  @IsString()
  height?: string;

  @IsOptional()
  @IsString()
  ethnicity?: string;

  @IsOptional()
  @IsString()
  firstLanguage?: string;

  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  likeToMarry?: string;

  @IsOptional()
  @IsString()
  currentLocation?: string;

  @IsOptional()
  @IsString()
  residenceStatus?: string;

  // Religious information
  @IsOptional()
  @IsString()
  religiousPractice?: string;

  @IsOptional()
  @IsString()
  sect?: string;

  @IsOptional()
  @IsBoolean()
  keepFast?: boolean;

  @IsOptional()
  @IsBoolean()
  pray?: boolean;

  @IsOptional()
  @IsString()
  halalDiet?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  womenWear?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menWear?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferWifeToWear?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferHusbandToWear?: string[];

  @IsOptional()
  @IsBoolean()
  isRevert?: boolean;

  @IsOptional()
  @IsBoolean()
  isConvert?: boolean;

  // Lifestyle
  @IsOptional()
  @IsString()
  livingWith?: string;

  @IsOptional()
  @IsBoolean()
  wantChildren?: boolean;

  @IsOptional()
  @IsBoolean()
  haveChildren?: boolean;

  @IsOptional()
  @IsString()
  willingToRelocate?: string;

  @IsOptional()
  @IsString()
  drinkAlcohol?: string;

  @IsOptional()
  @IsString()
  smoke?: string;

  @IsOptional()
  @IsString()
  disabilities?: string;

  @IsOptional()
  @IsString()
  exercise?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hobbies?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  // About me
  @IsOptional()
  @IsString()
  aboutMe?: string;

  // Partner preferences
  @IsOptional()
  @IsString()
  partnerSect?: string;

  @IsOptional()
  @IsString()
  partnerMaritalStatus?: string;

  @IsOptional()
  @IsString()
  partnerBirthplace?: string;

  @IsOptional()
  @IsString()
  partnerRaised?: string;

  @IsOptional()
  @IsString()
  partnerAge?: string;

  @IsOptional()
  @IsString()
  partnerHeight?: string;

  @IsOptional()
  @IsString()
  partnerEducation?: string;

  @IsOptional()
  @IsString()
  partnerResidenceStatus?: string;

  @IsOptional()
  @IsString()
  partnerEthnicity?: string;

  @IsOptional()
  @IsString()
  partnerLanguage?: string;

  @IsOptional()
  @IsBoolean()
  partnerHaveChildren?: boolean;

  @IsOptional()
  @IsString()
  partnerCurrentLocation?: string;
}
