import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserStatus } from '../../users/enums/userStatus.enum';

export class UpdateUserStatusDto {
  @IsNotEmpty()
  @IsEnum(UserStatus)
  status: UserStatus;
}
