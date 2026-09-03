import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { SignUpDto } from './dto/signup.dto';
import * as bcrypt from 'bcryptjs';
import { MailService } from 'src/mail/mail.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as crypto from 'crypto';
import { UserStatus } from 'src/users/enums/userStatus.enum';
import { AuthType } from 'src/users/enums/authType.enum';
import { stripPassword } from 'src/utils/user.utils';
import { LoggingService } from 'src/logging/logging.service';
import {
  isUsernameReserved,
  isUsernameProfane,
} from 'src/utils/username-validation';
import { appleVerify, googleSignIn } from './utils/oauth-utils';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';

@Injectable()
export class AuthService {
  constructor(
    private userService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    private readonly loggingService: LoggingService,
    private readonly cloudinaryService: CloudinaryService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectPinoLogger(AuthService.name)
    private readonly logger: PinoLogger,
  ) {}

  private static readonly OTP_TTL_MS = 60_000 * 5;
  private static readonly OTP_COOLDOWN_MS = 60_000;
  private static readonly MAX_OTP_ATTEMPTS = 5;

  private errorName(error: unknown): string {
    const errorName =
      error instanceof Error && typeof error.name === 'string'
        ? error.name
        : '';

    return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(errorName)
      ? errorName
      : 'UnknownError';
  }

  private generateOtp(previousCode?: unknown): number {
    const previous = Number(previousCode);
    const hasSixDigitPrevious =
      Number.isInteger(previous) && previous >= 100000 && previous <= 999999;

    if (!hasSixDigitPrevious) {
      return crypto.randomInt(100000, 1000000);
    }

    const candidate = crypto.randomInt(100000, 999999);
    return candidate >= previous ? candidate + 1 : candidate;
  }

  private otpCacheKey(purpose: 'signup' | 'reset', email: string): string {
    return `otp:${purpose}:${email.toLowerCase()}`;
  }

  private otpAttemptsKey(purpose: 'signup' | 'reset', email: string): string {
    return `otp_attempts:${purpose}:${email.toLowerCase()}`;
  }

  private otpCooldownKey(purpose: 'signup' | 'reset', email: string): string {
    return `otp_cooldown:${purpose}:${email.toLowerCase()}`;
  }

  private async assertOtpNotInCooldown(
    purpose: 'signup' | 'reset',
    email: string,
  ): Promise<void> {
    const inCooldown = await this.cacheManager.get(
      this.otpCooldownKey(purpose, email),
    );
    if (inCooldown) {
      throw new BadRequestException('mmij-37');
    }
  }

  private async setOtpCooldown(
    purpose: 'signup' | 'reset',
    email: string,
  ): Promise<void> {
    await this.cacheManager.set(
      this.otpCooldownKey(purpose, email),
      1,
      AuthService.OTP_COOLDOWN_MS,
    );
  }

  /**
   * Increment the wrong-attempt counter. Returns { locked: true } when the
   * caller should treat the OTP as invalidated (counter hit MAX_OTP_ATTEMPTS).
   * On lock, the OTP and counter are both deleted so a fresh generate yields
   * a clean slate.
   */
  private async recordWrongOtpAttempt(
    purpose: 'signup' | 'reset',
    email: string,
  ): Promise<{ locked: boolean }> {
    const attemptsKey = this.otpAttemptsKey(purpose, email);
    const current = (await this.cacheManager.get<number>(attemptsKey)) ?? 0;
    const next = current + 1;

    if (next >= AuthService.MAX_OTP_ATTEMPTS) {
      await this.cacheManager.del(this.otpCacheKey(purpose, email));
      await this.cacheManager.del(attemptsKey);
      return { locked: true };
    }

    await this.cacheManager.set(attemptsKey, next, AuthService.OTP_TTL_MS);
    return { locked: false };
  }

  private async clearOtpAttempts(
    purpose: 'signup' | 'reset',
    email: string,
  ): Promise<void> {
    await this.cacheManager.del(this.otpAttemptsKey(purpose, email));
  }

  private async clearOtpState(
    purpose: 'signup' | 'reset',
    email: string,
  ): Promise<void> {
    const results = await Promise.allSettled([
      this.cacheManager.del(this.otpCacheKey(purpose, email)),
      this.cacheManager.del(this.otpAttemptsKey(purpose, email)),
      this.cacheManager.del(this.otpCooldownKey(purpose, email)),
    ]);

    const failureCount = results.filter(
      (result) => result.status === 'rejected',
    ).length;

    if (failureCount > 0) {
      this.logger.warn(
        { stage: 'otp_cleanup', purpose, failureCount },
        'Failed to completely clear OTP state',
      );
    }
  }

  private async rollbackPendingSignup(user: {
    _id: { toString(): string } | string;
    email: string;
  }): Promise<void> {
    const userId = user._id.toString();

    try {
      const deleted = await this.userService.deletePendingUserById(userId);

      if (!deleted) {
        this.logger.warn(
          { stage: 'pending_user_rollback', userId },
          'Signup rollback did not delete user because it was no longer pending',
        );
      }
    } catch (error) {
      this.logger.error(
        {
          stage: 'pending_user_rollback',
          userId,
          errorName: this.errorName(error),
        },
        'Failed to roll back pending user after OTP delivery failure',
      );
    }

    await this.clearOtpState('signup', user.email);
  }

  async validateUser(email: string, pass: string): Promise<any> {
    try {
      const userFromDb = await this.userService.findOneAndLean(
        email.toLowerCase(),
      );

      if (!userFromDb) {
        throw new UnauthorizedException('mmij-04');
      }

      const isEqual = await bcrypt.compare(pass, userFromDb.password);

      if (!isEqual) {
        throw new UnauthorizedException('mmij-05');
      }

      const { password, ...result } = userFromDb;
      return result;
    } catch (error) {
      this.logger.error({ error }, 'Error validating user');

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new InternalServerErrorException('mmij-00');
    }
  }

  async login(user: any) {
    if (!user || !user.email || !user._id) {
      throw new UnauthorizedException('mmij-00');
    }

    if (user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('mmij-banned');
    }
    if (user.status === UserStatus.PENDING) {
      throw new UnauthorizedException('mmij-20');
    }

    let userId: string;
    try {
      userId = user._id.toString();
    } catch (error) {
      this.logger.error(
        { error, userId: user._id },
        'Unable to convert userId to string',
      );
      throw new InternalServerErrorException('mmij-18');
    }

    const payload = {
      email: user.email,
      _id: userId,
      username: user.username,
      role: user.role,
    };

    let accessToken: string;
    try {
      accessToken = this.jwtService.sign(payload, { expiresIn: '30d' });
    } catch {
      throw new InternalServerErrorException('mmij-17');
    }

    const enrichedUser = this.withProfilePictureUrl({
      ...user,
      isOnboarded: !!user.isOnboarded,
      requiresAuthCompletion: !!user.requiresAuthCompletion,
    });

    return { user: enrichedUser, accessToken };
  }

  async signup(signUpDto: SignUpDto): Promise<any> {
    try {
      signUpDto.email = signUpDto.email.toLowerCase();
      signUpDto.username = signUpDto.username.toLowerCase();

      const existingPending = await this.findReusablePendingSignup(signUpDto);
      let user = existingPending;

      if (!user) {
        await this.validateUsernameAvailability(signUpDto.username);
        user = await this.createUser(signUpDto, [AuthType.LOCAL]);
      }

      const code = this.generateOtp();

      try {
        await this.cacheManager.set(
          this.otpCacheKey('signup', user.email),
          code,
          AuthService.OTP_TTL_MS,
        );
        await this.setOtpCooldown('signup', user.email);
      } catch (cacheError) {
        await this.rollbackPendingSignup(user);
        this.logger.error(
          {
            stage: 'otp_cache',
            purpose: 'signup',
            userId: user._id.toString(),
            errorName: this.errorName(cacheError),
          },
          'Signup verification failed',
        );
        throw new InternalServerErrorException('mmij-14');
      }

      try {
        await this.mailService.sendOtpEmail(user, code);
      } catch (mailError) {
        await this.rollbackPendingSignup(user);
        this.logger.error(
          {
            stage: 'otp_email',
            purpose: 'signup',
            userId: user._id.toString(),
            errorName: this.errorName(mailError),
          },
          'Signup verification failed',
        );
        throw new InternalServerErrorException('mmij-03');
      }
      // A brand-new user has no profile fields filled — isOnboarded is
      // false by definition. Read from the document to stay defensive.
      return {
        ...stripPassword(user),
        isOnboarded: !!user.isOnboarded,
        requiresAuthCompletion: !!user.requiresAuthCompletion,
      };
    } catch (error) {
      this.logger.error(
        {
          stage: 'signup',
          errorName: this.errorName(error),
        },
        'Error during signup',
      );
      throw error;
    }
  }

  private async findReusablePendingSignup(
    signUpDto: SignUpDto,
  ): Promise<any | undefined> {
    const existing = await this.userService.findOne(signUpDto.email);
    if (!existing) {
      return undefined;
    }

    let passwordMatches = false;
    if (
      existing.status === UserStatus.PENDING &&
      existing.username?.toLowerCase() === signUpDto.username &&
      existing.mobilePhone === signUpDto.mobilePhone
    ) {
      try {
        passwordMatches = await bcrypt.compare(
          signUpDto.password,
          existing.password,
        );
      } catch {
        passwordMatches = false;
      }
    }

    if (passwordMatches) {
      return existing;
    }

    throw new UnauthorizedException('mmij-01');
  }

  verifyToken(token: string): any {
    if (!token) {
      throw new BadRequestException('mmij-07');
    }

    try {
      const decodedToken = this.jwtService.verify(token);
      if (!decodedToken) {
        throw new UnauthorizedException('mmij-08');
      }
      return decodedToken;
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('mmij-09');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('mmij-08');
      }
      throw new UnauthorizedException('mmij-10');
    }
  }

  private async validateUsernameAvailability(username: string) {
    if (isUsernameReserved(username) || isUsernameProfane(username)) {
      throw new BadRequestException('mmij-36');
    }

    const usernameExists = await this.userService.findOneByUsername(username);
    if (usernameExists) {
      await this.loggingService.createLog({
        userId: username,
        action: 'Performed some action',
      });
      throw new BadRequestException('mmij-21');
    }
  }

  private async createUser(signUpDto: SignUpDto, authType: AuthType[] = []) {
    const {
      email,
      password,
      firstName,
      lastName,
      username,
      dateOfBirth,
      mobilePhone,
      gender,
      onBehalf,
    } = signUpDto;

    const hashedPassword = await bcrypt.hash(password, 10);

    return this.userService.saveUser({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      username,
      dateOfBirth,
      mobilePhone,
      gender,
      onBehalf,
      status: UserStatus.PENDING,
      timeZone: 'UTC',
      authType,
    });
  }

  async verifyCode(email: string, code: string): Promise<void> {
    const user = await this.userService.findOne(email?.toLowerCase());

    if (!user) {
      this.logger.warn(
        { stage: 'otp_verification', purpose: 'signup' },
        'Verify code attempted for non-existent user',
      );
      throw new NotFoundException('mmij-04');
    }

    if (user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('mmij-banned');
    }

    if (user.status === UserStatus.ACTIVE) {
      return;
    }

    const cacheKey = this.otpCacheKey('signup', email);
    const value = await this.cacheManager.get(cacheKey);

    if (!value) {
      throw new UnauthorizedException('mmij-11');
    }

    if (String(value) !== String(code)) {
      const { locked } = await this.recordWrongOtpAttempt('signup', email);
      throw new UnauthorizedException(locked ? 'mmij-11' : 'mmij-12');
    }

    await this.userService.activateAndAddLocalAuth(email);

    try {
      await this.cacheManager.del(cacheKey);
      await this.clearOtpAttempts('signup', email);
    } catch (cacheError) {
      this.logger.warn(
        {
          stage: 'otp_cleanup',
          purpose: 'signup',
          userId: user._id.toString(),
          errorName: this.errorName(cacheError),
        },
        'Failed to delete OTP from cache after verification',
      );
    }

    this.mailService.sendWelcomeEmail(user).catch((error) =>
      this.logger.error(
        {
          stage: 'welcome_email',
          userId: user._id.toString(),
          errorName: this.errorName(error),
        },
        '[Auth] sendWelcomeEmail failed',
      ),
    );
  }

  async generateCode(email: string): Promise<void> {
    try {
      const normalizedEmail = email?.toLowerCase();
      const user = await this.userService.findOne(normalizedEmail);
      if (!user) {
        throw new NotFoundException('mmij-04');
      }

      if (user.status === UserStatus.DELETED) {
        throw new UnauthorizedException('mmij-banned');
      }
      const purpose: 'signup' | 'reset' =
        user.status === UserStatus.PENDING ? 'signup' : 'reset';

      await this.assertOtpNotInCooldown(purpose, normalizedEmail);
      let code: number;

      try {
        const cacheKey = this.otpCacheKey(purpose, normalizedEmail);
        const previousCode = await this.cacheManager.get(cacheKey);
        code = this.generateOtp(previousCode);

        this.logger.debug(
          { purpose, userId: user._id.toString() },
          'Generated verification code',
        );
        await this.loggingService.createLog({
          userId: user._id.toString(),
          action: 'Generated verification code',
        });

        await this.cacheManager.set(cacheKey, code, AuthService.OTP_TTL_MS);
        await this.clearOtpAttempts(purpose, normalizedEmail);
        await this.setOtpCooldown(purpose, normalizedEmail);
      } catch (cacheError) {
        await this.clearOtpState(purpose, normalizedEmail);
        this.logger.error(
          {
            stage: 'otp_cache',
            purpose,
            userId: user._id.toString(),
            errorName: this.errorName(cacheError),
          },
          'Failed to generate verification code',
        );
        throw new InternalServerErrorException('mmij-14');
      }

      try {
        if (purpose === 'reset') {
          await this.mailService.sendForgotPasswordEmail(user, code);
        } else {
          await this.mailService.sendOtpEmail(user, code);
        }
      } catch (mailError) {
        await this.clearOtpState(purpose, normalizedEmail);
        this.logger.error(
          {
            stage: 'otp_email',
            purpose,
            userId: user._id.toString(),
            errorName: this.errorName(mailError),
          },
          'Failed to generate verification code',
        );
        throw new InternalServerErrorException('mmij-03');
      }

      return;
    } catch (error) {
      throw error;
    }
  }

  async resetPassword(
    email: string,
    password: string,
    code: string,
  ): Promise<any> {
    const user = await this.userService.findOne(email?.toLowerCase());

    if (!user) {
      throw new NotFoundException('mmij-04');
    }
    const cacheKey = this.otpCacheKey('reset', email);
    const value = await this.cacheManager.get(cacheKey);
    if (!value) {
      throw new UnauthorizedException('mmij-11');
    }
    if (String(value) !== String(code)) {
      const { locked } = await this.recordWrongOtpAttempt('reset', email);
      throw new UnauthorizedException(locked ? 'mmij-11' : 'mmij-12');
    }

    try {
      if (!user.authType.includes(AuthType.LOCAL)) {
        user.authType.push(AuthType.LOCAL);
      }
      user.password = await bcrypt.hash(password, 10);
      await user.save();
    } catch (error) {
      this.logger.error({ error, email }, 'Error resetting password');
      throw new UnauthorizedException('mmij-15');
    }
    try {
      await this.cacheManager.del(cacheKey);
      await this.clearOtpAttempts('reset', email);
    } catch (cacheError) {
      this.logger.warn(
        { error: cacheError },
        'Failed to delete verification code from cache',
      );
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<any> {
    const user = await this.userService.findById(userId);

    if (!user) {
      throw new NotFoundException('mmij-04');
    }

    const isEqual = await bcrypt.compare(currentPassword, user.password);

    if (!isEqual) {
      throw new UnauthorizedException('mmij-05');
    }

    try {
      user.password = await bcrypt.hash(newPassword, 10);
      await user.save();

      this.mailService
        .sendPasswordChangedEmail(user)
        .catch((err) =>
          this.logger.error(
            { err, userId },
            '[Auth] sendPasswordChangedEmail failed',
          ),
        );

      return { message: 'Password changed successfully' };
    } catch (error) {
      this.logger.error({ error, userId }, 'Error changing password');
      throw new InternalServerErrorException('mmij-32');
    }
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalizedEmail = email?.toLowerCase();
    const user = await this.userService.findOne(normalizedEmail);

    if (!user) {
      throw new NotFoundException('mmij-04');
    }

    if (user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('mmij-banned');
    }

    await this.assertOtpNotInCooldown('reset', normalizedEmail);

    const code = crypto.randomInt(100000, 1000000);

    try {
      await this.cacheManager.set(
        this.otpCacheKey('reset', normalizedEmail),
        code,
        AuthService.OTP_TTL_MS,
      );
      await this.clearOtpAttempts('reset', normalizedEmail);
      await this.setOtpCooldown('reset', normalizedEmail);
    } catch (cacheError) {
      this.logger.error(
        { error: cacheError },
        'Failed to cache forgot password code',
      );
      throw new InternalServerErrorException('mmij-15');
    }

    this.mailService
      .sendForgotPasswordEmail(user, code)
      .catch((err) =>
        this.logger.error(
          { err, email: normalizedEmail },
          '[Auth] sendForgotPasswordEmail failed',
        ),
      );

    return { message: 'Password reset code sent to your email' };
  }

  async socialSignIn(
    token: string,
    authType: AuthType,
    redirectUri?: string,
    userInfo?: { firstName?: string; lastName?: string },
  ): Promise<{ user: any; accessToken: string }> {
    let profile: any;
    switch (authType) {
      case AuthType.GOOGLE:
        profile = await googleSignIn(token, redirectUri);
        break;

      case AuthType.APPLE:
        profile = await appleVerify(token, redirectUri, userInfo);
        break;

      default:
        throw new BadRequestException('auth-19');
    }

    return this.linkOrCreateSocialUser(authType, profile);
  }

  private withProfilePictureUrl<T extends { profilePicture?: string | null }>(
    user: T,
  ): T {
    if (!user.profilePicture) {
      return user;
    }

    try {
      const url = this.cloudinaryService.getSignedUrl(
        user.profilePicture,
        'image',
      );
      return { ...user, profilePicture: url };
    } catch (error) {
      this.logger.warn({ error }, 'Error signing profile picture URL');
      return user;
    }
  }

  private async generateSocialUsername(profile: {
    firstName?: string;
    lastName?: string;
  }): Promise<string> {
    const sanitize = (s: string) =>
      (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const base =
      sanitize(profile.firstName) + sanitize(profile.lastName) || 'user';

    // Try up to 10 random suffixes; if all collide (vanishingly unlikely), fall
    // back to a longer hex suffix that is effectively guaranteed unique.
    for (let i = 0; i < 10; i++) {
      const candidate =
        base + Math.floor(1000 + Math.random() * 9000).toString();
      if (isUsernameReserved(candidate) || isUsernameProfane(candidate)) {
        continue;
      }
      const existing = await this.userService.findOneByUsername(candidate);
      if (!existing) {
        return candidate;
      }
    }

    const fallback = base + crypto.randomBytes(6).toString('hex');
    return fallback;
  }

  private async linkOrCreateSocialUser(
    authType: AuthType,
    profile: any,
  ): Promise<{ user: any; accessToken: string }> {
    // Apple may omit email on repeat sign-ins. Fall back to looking up the
    // user by their stable provider sub (externalId) so they can still log in.
    if (!profile.email) {
      const existing = await this.userService.findByExternalId(
        authType,
        profile.externalId,
      );
      if (!existing) {
        throw new BadRequestException('mmij-35');
      }
      return this.finalizeSocialSignIn(existing, false);
    }

    let result: { user: any; newlyLinked: boolean; justCreated: boolean };
    try {
      result = await this.userService.linkSocialOrCreate(
        authType,
        {
          email: profile.email,
          externalId: profile.externalId,
          firstName: profile.firstName,
          lastName: profile.lastName,
        },
        () => this.generateSocialUsername(profile),
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(
        { error, authType, email: profile.email },
        'Error linking/creating social user',
      );
      throw new InternalServerErrorException('auth-21');
    }

    if (result.newlyLinked) {
      this.mailService
        .sendAuthMethodLinkedEmail(result.user, authType)
        .catch((err: any) =>
          this.logger.error(
            { err, email: result.user.email, authType },
            '[Auth] sendAuthMethodLinkedEmail failed',
          ),
        );
    }

    return this.finalizeSocialSignIn(result.user, result.justCreated);
  }

  private async finalizeSocialSignIn(
    user: any,
    isNewSignup: boolean,
  ): Promise<{ user: any; accessToken: string }> {
    if (user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('mmij-banned');
    }

    // login() builds the response via `{ ...user, isOnboarded }`, which
    // doesn't enumerate Mongoose document schema fields — the client would
    // receive a body missing _id, email, etc. Convert to a plain object
    // (and strip password) so it round-trips like the local-login path.
    const plain = typeof user.toObject === 'function' ? user.toObject() : user;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...sanitized } = plain;

    const { user: enrichedUser, accessToken } = await this.login(sanitized);
    return {
      user: { ...enrichedUser, isNewSignup },
      accessToken,
    };
  }
}
