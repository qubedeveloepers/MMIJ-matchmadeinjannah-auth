# NestJS Authentication System - Implementation Guide

This guide provides step-by-step instructions to implement the complete authentication system from the MatchMadeInJannah project into a new NestJS application.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Project Structure](#project-structure)
4. [Step-by-Step Implementation](#step-by-step-implementation)
5. [Configuration](#configuration)
6. [Testing the Implementation](#testing-the-implementation)

---

## Prerequisites

- Node.js (v16+)
- NestJS CLI installed: `npm i -g @nestjs/cli`
- MongoDB instance running
- Google OAuth credentials (optional, for social login)

---

## Installation

### 1. Create New NestJS Project (if needed)
```bash
nest new your-project-name
cd your-project-name
```

### 2. Install Required Dependencies
```bash
# Core dependencies
npm install @nestjs/mongoose mongoose
npm install @nestjs/jwt @nestjs/passport passport passport-jwt passport-local
npm install bcryptjs
npm install cache-manager
npm install class-validator class-transformer
npm install jsonwebtoken

# Type definitions
npm install -D @types/passport-jwt @types/passport-local @types/bcryptjs @types/jsonwebtoken
```

---

## Project Structure

Create the following folder structure:

```
src/
├── auth/
│   ├── decorators/
│   │   └── roles.decorator.ts
│   ├── dto/
│   │   ├── credentials.dto.ts
│   │   ├── login.dto.ts
│   │   └── signup.dto.ts
│   ├── enums/
│   │   └── role.enum.ts
│   ├── guards/
│   │   └── roles.guard.ts
│   ├── pipes/
│   │   └── credentials-validation.pipe.ts
│   ├── utils/
│   │   └── oauth-utils.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.module.ts
│   ├── constants.ts
│   ├── jwt.strategy.ts
│   ├── local.strategy.ts
│   ├── jwt-auth.guard.ts
│   └── local-auth.guard.ts
├── users/
│   ├── dto/
│   │   └── profile.dto.ts
│   ├── enums/
│   │   ├── authType.enum.ts
│   │   ├── userStatus.enum.ts
│   │   └── role.enum.ts
│   ├── user.schema.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── users.module.ts
├── filters/
│   └── exception.handler.ts
├── constants.ts
├── error-codes.json
├── app.module.ts
└── main.ts
```

---

## Step-by-Step Implementation

### Step 1: Environment Variables

Create `.env` file:
```env
# Database
DB_URL=mongodb://localhost:27017/your-database-name

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
REDIRECT_URI=http://localhost:3000/auth/google/callback

# Server
PORT=3000
```

Install dotenv:
```bash
npm install @nestjs/config
```

### Step 2: Create Enums

**src/auth/enums/role.enum.ts**
```typescript
export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
}
```

**src/users/enums/authType.enum.ts**
```typescript
export enum AuthType {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
  FACEBOOK = 'FACEBOOK',
  APPLE = 'APPLE',
}
```

**src/users/enums/userStatus.enum.ts**
```typescript
export enum UserStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  DELETED = 'DELETED',
}
```

### Step 3: Create User Schema

**src/users/user.schema.ts**
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AuthType } from './enums/authType.enum';
import { UserStatus } from './enums/userStatus.enum';
import { Role } from '../auth/enums/role.enum';

@Schema({ timestamps: true })
export class User extends Document {
  _id: Types.ObjectId;

  @Prop({ required: true })
  authType: AuthType[];

  @Prop([{
    authType: { type: String, enum: AuthType },
    externalId: String,
    createdAt: Date,
    updatedAt: Date,
  }])
  accounts: { authType; externalId; createdAt; updatedAt }[];

  @Prop({ unique: true, sparse: true })
  email: string;

  @Prop()
  password: string;

  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true, default: UserStatus.PENDING })
  status: UserStatus;

  @Prop({ type: String, enum: Role, default: Role.USER })
  role: Role;

  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop({ type: Date })
  dateOfBirth: Date;

  @Prop()
  mobilePhone: string;

  @Prop({ enum: ['Male', 'Female'] })
  gender: string;

  @Prop()
  onBehalf: string;

  @Prop()
  profilePicture: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
```

### Step 4: Create DTOs

**src/auth/dto/signup.dto.ts**
```typescript
import { IsEmail, IsString, MinLength, IsDate, IsEnum, IsMobilePhone } from 'class-validator';
import { Type } from 'class-transformer';

export class SignUpDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  firstName?: string;

  @IsString()
  lastName?: string;

  @IsString()
  username: string;

  @IsDate()
  @Type(() => Date)
  dateOfBirth: Date;

  @IsMobilePhone()
  mobilePhone: string;

  @IsEnum(['Male', 'Female'])
  gender: string;

  @IsString()
  onBehalf: string;
}
```

**src/auth/dto/login.dto.ts**
```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
```

**src/auth/dto/credentials.dto.ts**
```typescript
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class CredentialsDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  code?: string;

  @IsOptional()
  @IsString()
  redirectUri?: string;

  @IsOptional()
  @IsString()
  newPassword?: string;
}
```

### Step 5: Create Constants

**src/auth/constants.ts**
```typescript
import { SetMetadata } from '@nestjs/common';

export const jwtConstants = {
  secret: process.env.JWT_SECRET || 'change-this-secret-key',
};

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

### Step 6: Create Decorators

**src/auth/decorators/roles.decorator.ts**
```typescript
import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

### Step 7: Create Strategies

**src/auth/local.strategy.ts**
```typescript
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string): Promise<any> {
    const user = await this.authService.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status === 'PENDING') {
      throw new UnauthorizedException('User account is pending verification');
    }
    return user;
  }
}
```

**src/auth/jwt.strategy.ts**
```typescript
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { jwtConstants } from './constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: any) {
    return {
      userId: payload._id,
      email: payload.email,
      username: payload.username,
      role: payload.role,
    };
  }
}
```

### Step 8: Create Guards

**src/auth/local-auth.guard.ts**
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
```

**src/auth/jwt-auth.guard.ts**
```typescript
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from './constants';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  handleRequest(err: any, user: any, info: any, context: any, status: any) {
    if (info?.name === 'TokenExpiredError') {
      throw new UnauthorizedException('Token has expired');
    }
    if (info?.name === 'JsonWebTokenError') {
      throw new UnauthorizedException('Invalid token');
    }
    return super.handleRequest(err, user, info, context, status);
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
```

**src/auth/guards/roles.guard.ts**
```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      return false;
    }

    return requiredRoles.some((role) => user.role === role);
  }
}
```

### Step 9: Create Users Service

**src/users/users.service.ts**
```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';
import * as bcrypt from 'bcryptjs';
import { AuthType } from './enums/authType.enum';
import { UserStatus } from './enums/userStatus.enum';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async saveUser(userData: any): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const newUser = new this.userModel({
      ...userData,
      password: hashedPassword,
      status: UserStatus.PENDING,
      authType: [AuthType.LOCAL],
    });
    return newUser.save();
  }

  async findOne(email: string): Promise<User | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(userId: string): Promise<User | null> {
    return this.userModel.findById(userId).select('-password').exec();
  }

  async findOneByUsername(username: string): Promise<User | null> {
    return this.userModel.findOne({ username }).exec();
  }

  async setUserStatus(email: string, status: UserStatus): Promise<void> {
    await this.userModel.updateOne({ email: email.toLowerCase() }, { status }).exec();
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userModel.updateOne({ _id: userId }, { password: hashedPassword }).exec();
  }

  async checkUsernameExists(username: string): Promise<boolean> {
    const user = await this.userModel.findOne({ username }).exec();
    return !!user;
  }
}
```

### Step 10: Create Auth Service

**src/auth/auth.service.ts**
```typescript
import { Injectable, UnauthorizedException, BadRequestException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { SignUpDto } from './dto/signup.dto';
import * as bcrypt from 'bcryptjs';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AuthType } from '../users/enums/authType.enum';
import { UserStatus } from '../users/enums/userStatus.enum';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(pass, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    const { password, ...result } = user.toObject();
    return result;
  }

  async login(user: any) {
    const payload = {
      email: user.email,
      _id: user._id.toString(),
      username: user.username,
      role: user.role,
    };

    return {
      user,
      accessToken: this.jwtService.sign(payload, { expiresIn: '30d' }),
    };
  }

  async signup(signUpDto: SignUpDto) {
    // Check if user exists
    const existingUser = await this.usersService.findOne(signUpDto.email);
    if (existingUser) {
      throw new BadRequestException('Email already exists');
    }

    // Check if username exists
    const usernameExists = await this.usersService.checkUsernameExists(signUpDto.username);
    if (usernameExists) {
      throw new BadRequestException('Username already taken');
    }

    // Create user
    const user = await this.usersService.saveUser(signUpDto);

    // Generate verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await this.cacheManager.set(`verification_${signUpDto.email}`, code, 300000); // 5 minutes

    // TODO: Send email with verification code
    console.log(`Verification code for ${signUpDto.email}: ${code}`);

    const { password, ...result } = user.toObject();
    return result;
  }

  async verifyCode(email: string, code: string): Promise<void> {
    const cachedCode = await this.cacheManager.get(`verification_${email}`);

    if (!cachedCode) {
      throw new BadRequestException('Verification code expired');
    }

    if (cachedCode !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.usersService.setUserStatus(email, UserStatus.ACTIVE);
    await this.cacheManager.del(`verification_${email}`);
  }

  async generateCode(email: string): Promise<void> {
    const user = await this.usersService.findOne(email);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await this.cacheManager.set(`verification_${email}`, code, 300000);

    // TODO: Send email with verification code
    console.log(`New verification code for ${email}: ${code}`);
  }

  async resetPassword(email: string, password: string, code: string): Promise<void> {
    const cachedCode = await this.cacheManager.get(`verification_${email}`);

    if (!cachedCode) {
      throw new BadRequestException('Verification code expired');
    }

    if (cachedCode !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    const user = await this.usersService.findOne(email);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    await this.usersService.updatePassword(user._id.toString(), password);
    await this.cacheManager.del(`verification_${email}`);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Verify current password
    const userWithPassword = await this.usersService.findOne(user.email);
    const isPasswordValid = await bcrypt.compare(currentPassword, userWithPassword.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.usersService.updatePassword(userId, newPassword);
  }

  verifyToken(token: string): any {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired');
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
```

### Step 11: Create Controllers

**src/auth/auth.controller.ts**
```typescript
import { Controller, Post, Body, UseGuards, Request, HttpCode, Put, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/signup.dto';
import { CredentialsDto } from './dto/credentials.dto';
import { LocalAuthGuard } from './local-auth.guard';
import { Public } from './constants';
import { Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @HttpCode(201)
  @Post('signup')
  async signup(@Body() signUpDto: SignUpDto) {
    return this.authService.signup(signUpDto);
  }

  @Public()
  @HttpCode(200)
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(req.user);
    res.setHeader('Authorization', `Bearer ${result.accessToken}`);
    return result;
  }

  @Public()
  @Put('verify-token')
  @HttpCode(200)
  verifyToken(@Request() req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new Error('Authorization header missing');
    }
    const token = authHeader.split(' ')[1];
    return this.authService.verifyToken(token);
  }

  @Public()
  @Post('verifyCode')
  @HttpCode(200)
  async verifyCode(@Body() credentials: CredentialsDto) {
    return this.authService.verifyCode(credentials.email, credentials.code);
  }

  @Public()
  @Post('generateCode')
  async generateCode(@Body() credentials: CredentialsDto) {
    return this.authService.generateCode(credentials.email);
  }

  @Public()
  @Post('resetPassword')
  @HttpCode(200)
  async resetPassword(@Body() credentials: CredentialsDto) {
    return this.authService.resetPassword(
      credentials.email,
      credentials.newPassword,
      credentials.code,
    );
  }

  @Post('changePassword')
  @HttpCode(200)
  async changePassword(@Request() req, @Body() credentials: CredentialsDto) {
    return this.authService.changePassword(
      req.user.userId,
      credentials.password,
      credentials.newPassword,
    );
  }
}
```

**src/users/users.controller.ts**
```typescript
import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  async getProfile(@Request() req) {
    return this.usersService.findById(req.user.userId);
  }
}
```

### Step 12: Create Modules

**src/users/users.module.ts**
```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
```

**src/auth/auth.module.ts**
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CacheModule } from '@nestjs/cache-manager';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { LocalStrategy } from './local.strategy';
import { JwtStrategy } from './jwt.strategy';
import { jwtConstants } from './constants';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    CacheModule.register({
      ttl: 300000, // 5 minutes
    }),
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '30d' },
    }),
  ],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
```

### Step 13: Update App Module

**src/app.module.ts**
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.DB_URL || 'mongodb://localhost:27017/auth-db'),
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
```

### Step 14: Update Main.ts

**src/main.ts**
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const formattedErrors = errors.map((err) => ({
          field: err.property,
          errors: Object.values(err.constraints || {}),
        }));
        return new BadRequestException({
          message: 'Validation failed',
          errors: formattedErrors,
        });
      },
    }),
  );

  // Enable CORS
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['Authorization'],
  });

  await app.listen(process.env.PORT || 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
```

---

## Configuration

### Update .env with your values:
```env
DB_URL=mongodb://localhost:27017/your-database-name
JWT_SECRET=your-very-secure-random-secret-key
PORT=3000
```

---

## Testing the Implementation

### 1. Start the Application
```bash
npm run start:dev
```

### 2. Test Signup
```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "username": "testuser",
    "firstName": "Test",
    "lastName": "User",
    "dateOfBirth": "1990-01-01",
    "mobilePhone": "+12125551234",
    "gender": "Male",
    "onBehalf": "Self"
  }'
```

### 3. Verify Email (check console for code)
```bash
curl -X POST http://localhost:3000/auth/verifyCode \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "123456"
  }'
```

### 4. Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 5. Access Protected Route
```bash
curl -X GET http://localhost:3000/users/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Next Steps

1. **Add Email Service**: Integrate with SendGrid, AWS SES, or similar for sending verification codes
2. **Add Google OAuth**: Implement the OAuth utils from the original project
3. **Add Rate Limiting**: Protect against brute force attacks
4. **Add Refresh Tokens**: Implement token refresh mechanism
5. **Add More Validation**: Strengthen password requirements
6. **Add Logging**: Implement comprehensive logging system
7. **Add Testing**: Write unit and e2e tests

---

## Security Recommendations

1. **Change JWT Secret**: Use a strong, random secret in production
2. **Use HTTPS**: Always use HTTPS in production
3. **Rate Limiting**: Add rate limiting to prevent brute force attacks
4. **Password Policy**: Enforce stronger password requirements
5. **Token Refresh**: Implement refresh token mechanism
6. **Security Headers**: Add helmet middleware
7. **Input Sanitization**: Add additional input validation

---

## Common Issues & Solutions

### Issue: MongoDB Connection Failed
**Solution**: Ensure MongoDB is running and connection string is correct

### Issue: JWT Token Invalid
**Solution**: Check JWT_SECRET matches between signup and login

### Issue: Validation Errors
**Solution**: Ensure all required fields are provided in correct format

### Issue: CORS Errors
**Solution**: Add your frontend URL to CORS origins in main.ts

---

## Support

For questions or issues:
- Review the original project documentation above
- Check NestJS official documentation
- Ensure all dependencies are properly installed

---

**Last Updated**: 2025-12-11
**Source Project**: MatchMadeInJannah Auth System
