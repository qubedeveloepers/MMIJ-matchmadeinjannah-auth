import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { CredentialsDto } from '../dto/credentials.dto';

@Injectable()
export class CredentialsValidationPipe
  implements PipeTransform<CredentialsDto, CredentialsDto>
{
  constructor(private readonly context: string) {}

  transform(value: CredentialsDto): CredentialsDto {
    if (value && value instanceof CredentialsDto) {
      switch (this.context) {
        case 'socialSignIn':
        case 'externalSignIn':
          if (!value.code) {
            throw new BadRequestException('auth-32');
          }
          break;
      }
    }
    return value;
  }
}
