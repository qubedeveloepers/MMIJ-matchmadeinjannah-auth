import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let mailerService: { sendMail: jest.Mock };
  let isEmailAllowed: jest.SpyInstance;
  let logger: { info: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    mailerService = {
      sendMail: jest.fn(),
    };

    logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    service = new MailService(mailerService as any, logger as any);

    isEmailAllowed = jest
      .spyOn(service as any, 'isEmailAllowed')
      .mockReturnValue(true);
  });

  it('resolves after the mail transport accepts the OTP email', async () => {
    mailerService.sendMail.mockResolvedValueOnce({
      accepted: ['member@example.com'],
      rejected: [],
    });

    await expect(
      service.sendOtpEmail(
        { email: 'member@example.com', firstName: 'Test' },
        246810,
      ),
    ).resolves.toBeUndefined();

    expect(logger.info).toHaveBeenCalledWith(
      {
        stage: 'smtp_acceptance',
        acceptedCount: 1,
        rejectedCount: 0,
      },
      'OTP email accepted by SMTP transport',
    );
  });

  it('propagates OTP mail transport failures', async () => {
    const deliveryError = Object.assign(new Error('mail delivery failed'), {
      code: 'ECONNECTION',
      responseCode: 421,
      command: 'CONN',
    });
    mailerService.sendMail.mockRejectedValueOnce(deliveryError);

    await expect(
      service.sendOtpEmail(
        { email: 'member@example.com', firstName: 'Test' },
        246810,
      ),
    ).rejects.toBe(deliveryError);

    expect(logger.error).toHaveBeenCalledWith(
      {
        stage: 'smtp_delivery',
        errorName: 'Error',
        errorCode: 'ECONNECTION',
        responseCode: 421,
        command: 'CONN',
      },
      'Failed to send OTP email',
    );
  });

  it('rejects a transport response that did not accept the recipient', async () => {
    mailerService.sendMail.mockResolvedValueOnce({
      accepted: [],
      rejected: ['member@example.com'],
    });

    await expect(
      service.sendOtpEmail(
        { email: 'member@example.com', firstName: 'Test' },
        246810,
      ),
    ).rejects.toThrow('SMTP transport did not accept verification email');
  });

  it.each([undefined, {}, { rejected: [] }])(
    'rejects a malformed successful transport response',
    async (transportResponse) => {
      mailerService.sendMail.mockResolvedValueOnce(transportResponse);

      await expect(
        service.sendOtpEmail(
          { email: 'member@example.com', firstName: 'Test' },
          246810,
        ),
      ).rejects.toThrow('SMTP transport did not accept verification email');
    },
  );

  it('does not gate verification emails behind the general whitelist', async () => {
    isEmailAllowed.mockReturnValueOnce(false);
    mailerService.sendMail.mockResolvedValueOnce({
      accepted: ['member@example.com'],
      rejected: [],
    });

    await expect(
      service.sendOtpEmail(
        { email: 'member@example.com', firstName: 'Test' },
        246810,
      ),
    ).resolves.toBeUndefined();

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'member@example.com',
        context: expect.objectContaining({ code: 246810 }),
      }),
    );
  });

  it('does not write the recipient, OTP, or transport message to logs', async () => {
    const deliveryError = new Error(
      'synthetic failure mentioning member@example.com and 246810',
    );
    mailerService.sendMail.mockRejectedValueOnce(deliveryError);

    await expect(
      service.sendOtpEmail(
        { email: 'member@example.com', firstName: 'Test' },
        246810,
      ),
    ).rejects.toBe(deliveryError);

    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).not.toContain('member@example.com');
    expect(logged).not.toContain('246810');
    expect(logged).not.toContain('synthetic failure');
  });

  it('sends a forgot password email with the reset template', async () => {
    mailerService.sendMail.mockResolvedValueOnce({
      accepted: ['member@example.com'],
      rejected: [],
    });

    await expect(
      service.sendForgotPasswordEmail(
        { email: 'member@example.com', firstName: 'Test' },
        246810,
      ),
    ).resolves.toBeUndefined();

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'member@example.com',
        template: './forgot-password',
        context: expect.objectContaining({ code: 246810 }),
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      {
        stage: 'forgot_password_smtp_acceptance',
        acceptedCount: 1,
        rejectedCount: 0,
      },
      'Forgot password email accepted by SMTP transport',
    );
  });

  it('does not whitelist-gate a forgot password email', async () => {
    isEmailAllowed.mockReturnValueOnce(false);
    mailerService.sendMail.mockResolvedValueOnce({
      accepted: ['member@example.com'],
      rejected: [],
    });

    await expect(
      service.sendForgotPasswordEmail({ email: 'member@example.com' }, 246810),
    ).resolves.toBeUndefined();

    expect(mailerService.sendMail).toHaveBeenCalled();
    expect(isEmailAllowed).not.toHaveBeenCalled();
  });

  it('propagates a forgot password email rejection', async () => {
    mailerService.sendMail.mockResolvedValueOnce({
      accepted: [],
      rejected: ['member@example.com'],
    });

    await expect(
      service.sendForgotPasswordEmail({ email: 'member@example.com' }, 246810),
    ).rejects.toThrow('SMTP transport did not accept password reset email');
  });
});
