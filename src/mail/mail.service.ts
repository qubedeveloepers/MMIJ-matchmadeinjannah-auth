import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';

@Injectable()
export class MailService {
  constructor(
    private mailerService: MailerService,
    @InjectPinoLogger(MailService.name)
    private readonly logger: PinoLogger,
  ) {}

  private baseContext() {
    return {
      logoUrl: process.env.APP_LOGO_URL || '',
      appName: process.env.APP_NAME || 'MatchMade in Jannah',
    };
  }

  private isEmailAllowed(email: string): boolean {
    const whitelist = process.env.EMAIL_WHITELIST;
    if (!whitelist) return true;
    return whitelist
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .includes(email.toLowerCase());
  }

  private safeErrorName(error: unknown): string {
    const errorName =
      error instanceof Error && typeof error.name === 'string'
        ? error.name
        : '';

    return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(errorName)
      ? errorName
      : 'UnknownError';
  }

  private smtpErrorContext(error: unknown, stage = 'smtp_delivery') {
    const smtpError = error as {
      code?: unknown;
      responseCode?: unknown;
      command?: unknown;
    };
    const errorCode =
      typeof smtpError?.code === 'string' && /^[A-Z0-9_]+$/.test(smtpError.code)
        ? smtpError.code
        : undefined;
    const command =
      typeof smtpError?.command === 'string' &&
      /^[A-Z0-9_]+$/i.test(smtpError.command)
        ? smtpError.command
        : undefined;

    return {
      stage,
      errorName: this.safeErrorName(error),
      errorCode,
      responseCode:
        typeof smtpError?.responseCode === 'number'
          ? smtpError.responseCode
          : undefined,
      command,
    };
  }

  async sendOtpEmail(
    user: { email: string; firstName?: string },
    code: number,
  ): Promise<void> {
    try {
      const transportResponse = await this.mailerService.sendMail({
        to: user.email,
        subject: 'Confirm your email — MatchMade in Jannah',
        template: './confirmation',
        context: {
          name: user.firstName || user.email,
          code,
          ...this.baseContext(),
        },
      });

      const acceptedCount = Array.isArray(transportResponse?.accepted)
        ? transportResponse.accepted.length
        : undefined;
      const rejectedCount = Array.isArray(transportResponse?.rejected)
        ? transportResponse.rejected.length
        : undefined;

      if (acceptedCount !== 1) {
        throw new Error('SMTP transport did not accept verification email');
      }

      this.logger.info(
        {
          stage: 'smtp_acceptance',
          acceptedCount,
          rejectedCount,
        },
        'OTP email accepted by SMTP transport',
      );
    } catch (error) {
      this.logger.error(
        this.smtpErrorContext(error),
        'Failed to send OTP email',
      );
      throw error;
    }
  }

  async sendForgotPasswordEmail(
    user: { email: string; firstName?: string },
    code: number,
  ): Promise<void> {
    try {
      const transportResponse = await this.mailerService.sendMail({
        to: user.email,
        subject: 'Reset your password — MatchMade in Jannah',
        template: './forgot-password',
        context: {
          name: user.firstName || user.email,
          code,
          ...this.baseContext(),
        },
      });

      const acceptedCount = Array.isArray(transportResponse?.accepted)
        ? transportResponse.accepted.length
        : undefined;
      const rejectedCount = Array.isArray(transportResponse?.rejected)
        ? transportResponse.rejected.length
        : undefined;

      if (acceptedCount !== 1) {
        throw new Error('SMTP transport did not accept password reset email');
      }

      this.logger.info(
        {
          stage: 'forgot_password_smtp_acceptance',
          acceptedCount,
          rejectedCount,
        },
        'Forgot password email accepted by SMTP transport',
      );
    } catch (error) {
      this.logger.error(
        this.smtpErrorContext(error, 'forgot_password_smtp_delivery'),
        'Failed to send forgot password email',
      );
      throw error;
    }
  }

  async sendWelcomeEmail(user: {
    email: string;
    firstName?: string;
  }): Promise<void> {
    if (!this.isEmailAllowed(user.email)) {
      this.logger.info(
        { stage: 'welcome_email_whitelist' },
        '[Mail] Email not in whitelist — skipped',
      );
      return;
    }
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Welcome to MatchMade in Jannah 🌙',
        template: './welcome',
        context: {
          name: user.firstName || user.email,
          ...this.baseContext(),
        },
      });
      this.logger.info({ stage: 'welcome_email' }, 'Welcome email sent');
    } catch (error) {
      this.logger.error(
        this.smtpErrorContext(error, 'welcome_email'),
        'Failed to send welcome email',
      );
    }
  }

  async sendPasswordChangedEmail(user: {
    email: string;
    firstName?: string;
  }): Promise<void> {
    if (!this.isEmailAllowed(user.email)) {
      this.logger.info(
        { email: user.email },
        '[Mail] Email not in whitelist — skipped',
      );
      return;
    }
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Your password has been changed — MatchMade in Jannah',
        template: './password-changed',
        context: {
          name: user.firstName || user.email,
          ...this.baseContext(),
        },
      });
      this.logger.info({ email: user.email }, 'Password changed email sent');
    } catch (error) {
      this.logger.error(
        { error, email: user.email },
        'Failed to send password changed email',
      );
    }
  }

  async sendProfileCompleteEmail(user: {
    email: string;
    firstName?: string;
  }): Promise<void> {
    if (!this.isEmailAllowed(user.email)) {
      this.logger.info(
        { email: user.email },
        '[Mail] Email not in whitelist — skipped',
      );
      return;
    }
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Your profile is complete! — MatchMade in Jannah',
        template: './profile-complete',
        context: {
          name: user.firstName || user.email,
          ...this.baseContext(),
        },
      });
      this.logger.info({ email: user.email }, 'Profile complete email sent');
    } catch (error) {
      this.logger.error(
        { error, email: user.email },
        'Failed to send profile complete email',
      );
    }
  }

  async sendAuthMethodLinkedEmail(
    user: { email: string; firstName?: string },
    authType: string,
  ): Promise<void> {
    if (!this.isEmailAllowed(user.email)) {
      this.logger.info(
        { email: user.email },
        '[Mail] Email not in whitelist — skipped',
      );
      return;
    }
    const providerLabel =
      authType.charAt(0).toUpperCase() + authType.slice(1).toLowerCase();
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: `New sign-in method linked — MatchMade in Jannah`,
        template: './auth-method-linked',
        context: {
          name: user.firstName || user.email,
          providerLabel,
          ...this.baseContext(),
        },
      });
      this.logger.info(
        { email: user.email, authType },
        'Auth method linked email sent',
      );
    } catch (error) {
      this.logger.error(
        { error, email: user.email, authType },
        'Failed to send auth method linked email',
      );
    }
  }

  async sendMediaApprovedEmail(
    user: { email: string; firstName?: string },
    mediaType: string,
  ): Promise<void> {
    if (!this.isEmailAllowed(user.email)) {
      this.logger.info(
        { email: user.email },
        '[Mail] Email not in whitelist — skipped',
      );
      return;
    }
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: `Your ${mediaType} has been approved — MatchMade in Jannah`,
        template: './media-approved',
        context: {
          name: user.firstName || user.email,
          mediaType,
          ...this.baseContext(),
        },
      });
      this.logger.info(
        { email: user.email, mediaType },
        'Media approved email sent',
      );
    } catch (error) {
      this.logger.error(
        { error, email: user.email, mediaType },
        'Failed to send media approved email',
      );
    }
  }

  async sendMediaRejectedEmail(
    user: { email: string; firstName?: string },
    mediaType: string,
    reason: string,
  ): Promise<void> {
    if (!this.isEmailAllowed(user.email)) {
      this.logger.info(
        { email: user.email },
        '[Mail] Email not in whitelist — skipped',
      );
      return;
    }
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: `Update on your submitted media — MatchMade in Jannah`,
        template: './media-rejected',
        context: {
          name: user.firstName || user.email,
          mediaType,
          reason,
          ...this.baseContext(),
        },
      });
      this.logger.info(
        { email: user.email, mediaType },
        'Media rejected email sent',
      );
    } catch (error) {
      this.logger.error(
        { error, email: user.email, mediaType },
        'Failed to send media rejected email',
      );
    }
  }
}
