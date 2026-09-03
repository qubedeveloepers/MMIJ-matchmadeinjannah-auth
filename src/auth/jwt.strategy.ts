import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { jwtConstants } from './constants';
import { UsersService } from '../users/users.service';
import { UserStatus } from '../users/enums/userStatus.enum';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly usersService: UsersService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: any) {
    const cacheKey = `user_status_${payload._id}`;
    let status = await this.cacheManager.get<string>(cacheKey);

    if (!status) {
      const user = await this.usersService.findById(payload._id);
      if (!user) throw new UnauthorizedException();
      status = user.status;
      await this.cacheManager.set(cacheKey, status, 30_000);
    }

    if (status === UserStatus.DELETED) {
      throw new UnauthorizedException('mmij-banned');
    }

    if (status === UserStatus.PENDING) {
      throw new UnauthorizedException('mmij-20');
    }

    return {
      userId: payload._id,
      email: payload.email,
      username: payload.username,
      role: payload.role,
    };
  }
}
