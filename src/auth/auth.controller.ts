import {
  Body,
  Controller,
  Post,
  Put,
  Request,
  UseGuards,
  HttpCode,
  Res,
  BadRequestException,
  Param,
  UsePipes,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import { Public } from './constants';
import { SignUpDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { CredentialsDto } from './dto/credentials.dto';
import { AuthType } from 'src/users/enums/authType.enum';
import { CredentialsValidationPipe } from './pipes/credentials-validation.pipe';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @HttpCode(201)
  @Post('signup')
  async signup(@Body() signUpDto: SignUpDto) {
    return await this.authService.signup(signUpDto);
  }

  @Public()
  @HttpCode(200)
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(
    @Body() _loginDto: LoginDto,
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken } = await this.authService.login(req.user);
    res.header('Authorization', `Bearer ${accessToken}`);
    return user;
  }

  @Public()
  @Put('verify-token')
  verifyToken(@Request() req) {
    if (!req.headers.authorization) {
      throw new BadRequestException('mmij-06');
    }
    const token = req.headers.authorization.split(' ')[1];
    return this.authService.verifyToken(token);
  }

  @Public()
  @Post('verifyCode')
  @HttpCode(200)
  async verifyCode(@Body() body: VerifyCodeDto): Promise<void> {
    return await this.authService.verifyCode(body.email, String(body.code));
  }

  @Public()
  @Post('generateCode')
  async generateCode(@Body() credentials: CredentialsDto): Promise<void> {
    try {
      return await this.authService.generateCode(credentials.email);
    } catch (error) {
      throw error;
    }
  }

  @Public()
  @Post('forgotPassword')
  @HttpCode(200)
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(body.email);
  }

  @Public()
  @Post('resetPassword')
  @HttpCode(200)
  async resetPassword(@Body() body: ResetPasswordDto): Promise<any> {
    return this.authService.resetPassword(
      body.email,
      body.password,
      String(body.code),
    );
  }

  @Post('changePassword')
  @HttpCode(200)
  async changePassword(
    @Request() req,
    @Body() credentials: CredentialsDto,
  ): Promise<any> {
    const userId = req.user.userId;
    await this.authService.changePassword(
      userId,
      credentials.password,
      credentials.newPassword,
    );
    return;
  }

  @Post('socialSignIn/:authType')
  @HttpCode(200)
  @Public()
  @UsePipes(new CredentialsValidationPipe('socialSignIn'))
  async socialSignIn(
    @Param('authType') authType: string,
    @Body() credentials: CredentialsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Partial<any>> {
    const { user, accessToken } = await this.authService.socialSignIn(
      credentials.code,
      authType.toUpperCase() as AuthType,
      credentials.redirectUri,
      credentials.userInfo,
    );

    res.header('Authorization', `Bearer ${accessToken}`);
    return user;
  }
}
