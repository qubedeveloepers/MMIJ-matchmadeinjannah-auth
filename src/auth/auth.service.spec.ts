import { AuthService } from './auth.service';
import { AuthType } from '../users/enums/authType.enum';
import { UserStatus } from '../users/enums/userStatus.enum';

const userService = {
  findOne: jest.fn(),
  findOneByUsername: jest.fn(),
  saveUser: jest.fn(),
  deletePendingUserById: jest.fn(),
  activateAndAddLocalAuth: jest.fn(),
};

const jwtService = {
  sign: jest.fn(),
  verify: jest.fn(),
};

const mailService = {
  sendOtpEmail: jest.fn(),
  sendForgotPasswordEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
};

const loggingService = {
  createLog: jest.fn(),
};

const cloudinaryService = {
  getSignedUrl: jest.fn(),
};

const cacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const logger = {
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

function signupDto() {
  return {
    email: 'Member@Example.com',
    password: 'password123',
    firstName: 'Test',
    lastName: 'Member',
    username: 'Test_Member',
    dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    mobilePhone: '+13135550100',
    gender: 'Female',
    onBehalf: 'Self',
  };
}

function pendingUser(overrides: Record<string, unknown> = {}) {
  const plain = {
    _id: 'pending-user-id',
    email: 'member@example.com',
    password: 'hashed-password',
    firstName: 'Test',
    lastName: 'Member',
    username: 'test_member',
    mobilePhone: '+13135550100',
    status: UserStatus.PENDING,
    authType: [AuthType.LOCAL],
    isOnboarded: false,
    requiresAuthCompletion: false,
    ...overrides,
  };

  return {
    ...plain,
    _id: { toString: () => 'pending-user-id' },
    toObject: () => ({ ...plain }),
  };
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.resetAllMocks();

    userService.findOne.mockResolvedValue(undefined);
    userService.findOneByUsername.mockResolvedValue(undefined);
    userService.saveUser.mockResolvedValue(pendingUser());
    userService.deletePendingUserById.mockResolvedValue(true);
    userService.activateAndAddLocalAuth.mockResolvedValue(undefined);
    mailService.sendOtpEmail.mockResolvedValue(undefined);
    mailService.sendForgotPasswordEmail.mockResolvedValue(undefined);
    mailService.sendWelcomeEmail.mockResolvedValue(undefined);
    loggingService.createLog.mockResolvedValue(undefined);
    cacheManager.get.mockResolvedValue(undefined);
    cacheManager.set.mockResolvedValue(undefined);
    cacheManager.del.mockResolvedValue(undefined);

    service = new AuthService(
      userService as any,
      jwtService as any,
      mailService as any,
      loggingService as any,
      cloudinaryService as any,
      cacheManager as any,
      logger as any,
    );
  });

  it('creates a pending user and sends a signup OTP', async () => {
    const result = await service.signup(signupDto());

    expect(userService.saveUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'member@example.com',
        username: 'test_member',
        mobilePhone: '+13135550100',
        status: UserStatus.PENDING,
        authType: [AuthType.LOCAL],
      }),
    );
    expect(cacheManager.set).toHaveBeenCalledWith(
      'otp:signup:member@example.com',
      expect.any(Number),
      300000,
    );
    expect(cacheManager.set).toHaveBeenCalledWith(
      'otp_cooldown:signup:member@example.com',
      1,
      60000,
    );
    expect(mailService.sendOtpEmail).toHaveBeenCalled();
    expect(userService.deletePendingUserById).not.toHaveBeenCalled();
    expect(result.password).toBeUndefined();
  });

  it('rolls back the pending user when OTP delivery fails', async () => {
    mailService.sendOtpEmail.mockRejectedValueOnce(
      new Error('mail delivery failed'),
    );

    await expect(service.signup(signupDto())).rejects.toThrow('mmij-03');

    expect(userService.deletePendingUserById).toHaveBeenCalledWith(
      'pending-user-id',
    );
    expect(cacheManager.del).toHaveBeenCalledWith(
      'otp:signup:member@example.com',
    );
    expect(cacheManager.del).toHaveBeenCalledWith(
      'otp_attempts:signup:member@example.com',
    );
    expect(cacheManager.del).toHaveBeenCalledWith(
      'otp_cooldown:signup:member@example.com',
    );
  });

  it('allows signup retry after failed delivery was rolled back', async () => {
    mailService.sendOtpEmail.mockRejectedValueOnce(
      new Error('mail delivery failed'),
    );

    await expect(service.signup(signupDto())).rejects.toThrow('mmij-03');
    await expect(service.signup(signupDto())).resolves.toEqual(
      expect.objectContaining({ email: 'member@example.com' }),
    );

    expect(userService.saveUser).toHaveBeenCalledTimes(2);
    expect(userService.deletePendingUserById).toHaveBeenCalledTimes(1);
  });

  it('reuses a matching pending signup when immediate rollback reports no deletion', async () => {
    userService.deletePendingUserById.mockResolvedValueOnce(false);
    mailService.sendOtpEmail.mockRejectedValueOnce(
      new Error('mail delivery failed'),
    );

    await expect(service.signup(signupDto())).rejects.toThrow('mmij-03');

    const storedPassword = userService.saveUser.mock.calls[0][0].password;
    userService.findOne.mockResolvedValueOnce(
      pendingUser({ password: storedPassword }),
    );

    await expect(service.signup(signupDto())).resolves.toEqual(
      expect.objectContaining({ email: 'member@example.com' }),
    );

    expect(userService.saveUser).toHaveBeenCalledTimes(1);
    expect(mailService.sendOtpEmail).toHaveBeenCalledTimes(2);
  });

  it('reuses a matching pending signup after immediate rollback throws', async () => {
    const rollbackError = new Error('database unavailable');
    userService.deletePendingUserById.mockRejectedValueOnce(rollbackError);
    mailService.sendOtpEmail.mockRejectedValueOnce(
      new Error('mail delivery failed'),
    );

    await expect(service.signup(signupDto())).rejects.toThrow('mmij-03');

    const storedPassword = userService.saveUser.mock.calls[0][0].password;
    userService.findOne.mockResolvedValueOnce(
      pendingUser({ password: storedPassword }),
    );

    await expect(service.signup(signupDto())).resolves.toEqual(
      expect.objectContaining({ email: 'member@example.com' }),
    );

    expect(userService.saveUser).toHaveBeenCalledTimes(1);
    expect(mailService.sendOtpEmail).toHaveBeenCalledTimes(2);

    const logged = JSON.stringify([
      ...logger.error.mock.calls,
      ...logger.warn.mock.calls,
    ]);
    expect(logged).not.toContain('member@example.com');
    expect(logged).not.toContain('database unavailable');
    expect(logged).not.toContain('mail delivery failed');
  });

  it('rejects an existing active email', async () => {
    userService.findOne.mockResolvedValueOnce(
      pendingUser({ status: UserStatus.ACTIVE }),
    );

    await expect(service.signup(signupDto())).rejects.toThrow('mmij-01');

    expect(userService.saveUser).not.toHaveBeenCalled();
    expect(mailService.sendOtpEmail).not.toHaveBeenCalled();
    expect(userService.deletePendingUserById).not.toHaveBeenCalled();
  });

  it('rejects an existing username', async () => {
    userService.findOneByUsername.mockResolvedValueOnce(pendingUser());

    await expect(service.signup(signupDto())).rejects.toThrow('mmij-21');

    expect(userService.saveUser).not.toHaveBeenCalled();
    expect(mailService.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('preserves a duplicate mobile database error', async () => {
    const duplicateError = {
      code: 11000,
      keyValue: { mobilePhone: '+13135550100' },
      errorResponse: {
        keyValue: { mobilePhone: '+13135550100' },
      },
    };
    userService.saveUser.mockRejectedValueOnce(duplicateError);

    await expect(service.signup(signupDto())).rejects.toBe(duplicateError);

    expect(mailService.sendOtpEmail).not.toHaveBeenCalled();
    expect(userService.deletePendingUserById).not.toHaveBeenCalled();
  });

  it('resends a signup OTP to an existing pending account', async () => {
    userService.findOne.mockResolvedValueOnce(pendingUser());

    await service.generateCode('Member@Example.com');

    expect(cacheManager.get).toHaveBeenCalledWith(
      'otp_cooldown:signup:member@example.com',
    );
    expect(cacheManager.set).toHaveBeenCalledWith(
      'otp:signup:member@example.com',
      expect.any(Number),
      300000,
    );
    expect(loggingService.createLog).toHaveBeenCalledWith({
      userId: 'pending-user-id',
      action: 'Generated verification code',
    });
    expect(mailService.sendOtpEmail).toHaveBeenCalled();
  });

  it('sends a forgot password email for an active account', async () => {
    const user = pendingUser({ status: UserStatus.ACTIVE });
    userService.findOne.mockResolvedValueOnce(user);

    await service.generateCode('Member@Example.com');

    expect(cacheManager.set).toHaveBeenCalledWith(
      'otp:reset:member@example.com',
      expect.any(Number),
      300000,
    );
    expect(mailService.sendForgotPasswordEmail).toHaveBeenCalledWith(
      user,
      expect.any(Number),
    );
    expect(mailService.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('returns a forgot password failure when reset email delivery fails', async () => {
    userService.findOne.mockResolvedValueOnce(
      pendingUser({ status: UserStatus.ACTIVE }),
    );
    mailService.sendForgotPasswordEmail.mockRejectedValueOnce(
      new Error('mail delivery failed'),
    );

    await expect(service.generateCode('Member@Example.com')).rejects.toThrow(
      'mmij-03',
    );

    expect(cacheManager.del).toHaveBeenCalledWith(
      'otp:reset:member@example.com',
    );
    expect(cacheManager.del).toHaveBeenCalledWith(
      'otp_attempts:reset:member@example.com',
    );
    expect(cacheManager.del).toHaveBeenCalledWith(
      'otp_cooldown:reset:member@example.com',
    );
    expect(mailService.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('invalidates the previous signup OTP when resending', async () => {
    const oldCode = 246810;
    userService.findOne.mockResolvedValue(pendingUser());
    cacheManager.get
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(oldCode);

    await service.generateCode('Member@Example.com');

    const newCode = mailService.sendOtpEmail.mock.calls[0][1] as number;
    expect(newCode).toBeGreaterThanOrEqual(100000);
    expect(newCode).toBeLessThanOrEqual(999999);
    expect(newCode).not.toBe(oldCode);
    expect(cacheManager.set).toHaveBeenCalledWith(
      'otp:signup:member@example.com',
      newCode,
      300000,
    );

    cacheManager.get.mockReset();
    cacheManager.get.mockResolvedValueOnce(newCode).mockResolvedValueOnce(0);

    await expect(
      service.verifyCode('member@example.com', String(oldCode)),
    ).rejects.toThrow('mmij-12');
    expect(userService.activateAndAddLocalAuth).not.toHaveBeenCalled();

    cacheManager.get.mockResolvedValueOnce(newCode);
    await service.verifyCode('member@example.com', String(newCode));

    expect(userService.activateAndAddLocalAuth).toHaveBeenCalledWith(
      'member@example.com',
    );
  });

  it('clears failed resend state and permits another attempt', async () => {
    userService.findOne.mockResolvedValue(pendingUser());
    mailService.sendOtpEmail.mockRejectedValueOnce(
      new Error('mail delivery failed'),
    );

    await expect(service.generateCode('Member@Example.com')).rejects.toThrow(
      'mmij-03',
    );

    expect(cacheManager.del).toHaveBeenCalledWith(
      'otp:signup:member@example.com',
    );
    expect(cacheManager.del).toHaveBeenCalledWith(
      'otp_cooldown:signup:member@example.com',
    );

    await expect(
      service.generateCode('Member@Example.com'),
    ).resolves.toBeUndefined();
    expect(mailService.sendOtpEmail).toHaveBeenCalledTimes(2);
    expect(userService.deletePendingUserById).not.toHaveBeenCalled();
  });

  it('activates a pending user after a correct OTP', async () => {
    userService.findOne.mockResolvedValueOnce(pendingUser());
    cacheManager.get.mockResolvedValueOnce(246810);

    await service.verifyCode('member@example.com', '246810');

    expect(userService.activateAndAddLocalAuth).toHaveBeenCalledWith(
      'member@example.com',
    );
    expect(cacheManager.del).toHaveBeenCalledWith(
      'otp:signup:member@example.com',
    );
    expect(cacheManager.del).toHaveBeenCalledWith(
      'otp_attempts:signup:member@example.com',
    );
    expect(mailService.sendWelcomeEmail).toHaveBeenCalled();
  });

  it('does not activate a pending user after an incorrect OTP', async () => {
    userService.findOne.mockResolvedValueOnce(pendingUser());
    cacheManager.get.mockResolvedValueOnce(111111).mockResolvedValueOnce(0);

    await expect(
      service.verifyCode('member@example.com', '222222'),
    ).rejects.toThrow('mmij-12');

    expect(userService.activateAndAddLocalAuth).not.toHaveBeenCalled();
    expect(cacheManager.set).toHaveBeenCalledWith(
      'otp_attempts:signup:member@example.com',
      1,
      300000,
    );
  });

  it('rejects an expired signup OTP without activating the user', async () => {
    userService.findOne.mockResolvedValueOnce(pendingUser());
    cacheManager.get.mockResolvedValueOnce(undefined);

    await expect(
      service.verifyCode('member@example.com', '246810'),
    ).rejects.toThrow('mmij-11');

    expect(userService.activateAndAddLocalAuth).not.toHaveBeenCalled();
    expect(mailService.sendWelcomeEmail).not.toHaveBeenCalled();
  });
});
