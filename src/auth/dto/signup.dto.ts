import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  IsDate,
  Validate,
  IsEnum,
  IsMobilePhone,
  IsOptional,
  Matches,
} from 'class-validator';

export class SignUpDto {
  @IsNotEmpty()
  @IsEmail({}, { message: 'Invalid email' })
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username may only contain letters, numbers, and underscores',
  })
  username: string;

  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  dateOfBirth: Date;

  @IsNotEmpty()
  @Validate(IsMobilePhone, [], { message: 'Invalid phone number' })
  mobilePhone: string;

  @IsNotEmpty()
  @IsEnum(['Male', 'Female'], {
    message: 'Gender must be either Male or Female',
  })
  gender: string;

  @IsNotEmpty()
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
    { message: 'Invalid value for On Behalf' },
  )
  onBehalf: string;
}
