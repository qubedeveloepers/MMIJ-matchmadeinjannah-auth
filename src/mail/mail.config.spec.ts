import { createMailerOptions } from './mail.config';

function mailEnvironment(
  overrides: Partial<NodeJS.ProcessEnv> = {},
): NodeJS.ProcessEnv {
  return {
    MAIL_HOST: 'smtp.test.invalid',
    MAIL_PORT: '587',
    MAIL_SECURE: 'false',
    MAIL_USER: 'test-user',
    MAIL_PASSWORD: 'test-password',
    MAIL_FROM: 'sender@test.invalid',
    ...overrides,
  };
}

describe('createMailerOptions', () => {
  it('supports STARTTLS-style SMTP on port 587', () => {
    const options = createMailerOptions(mailEnvironment());

    expect(options.transport).toEqual(
      expect.objectContaining({
        host: 'smtp.test.invalid',
        port: 587,
        secure: false,
        auth: {
          user: 'test-user',
          pass: 'test-password',
        },
      }),
    );
    expect(options.defaults).toEqual({
      from: '"Match Made In Jannah" sender@test.invalid',
    });
  });

  it('supports implicit TLS SMTP on port 465', () => {
    const options = createMailerOptions(
      mailEnvironment({
        MAIL_PORT: '465',
        MAIL_SECURE: 'true',
      }),
    );

    expect(options.transport).toEqual(
      expect.objectContaining({
        host: 'smtp.test.invalid',
        port: 465,
        secure: true,
      }),
    );
  });

  it.each([
    'MAIL_HOST',
    'MAIL_PORT',
    'MAIL_SECURE',
    'MAIL_USER',
    'MAIL_PASSWORD',
    'MAIL_FROM',
  ] as const)('fails clearly when %s is missing', (name) => {
    const environment = mailEnvironment();
    delete environment[name];

    expect(() => createMailerOptions(environment)).toThrow(
      `Missing required environment variable: ${name}`,
    );
  });

  it.each(['not-a-number', '0', '65536'])(
    'rejects invalid MAIL_PORT settings',
    (MAIL_PORT) => {
      expect(() => createMailerOptions(mailEnvironment({ MAIL_PORT }))).toThrow(
        'MAIL_PORT',
      );
    },
  );

  it('accepts another valid numeric SMTP port', () => {
    const options = createMailerOptions(
      mailEnvironment({
        MAIL_PORT: '2525',
      }),
    );

    expect(options.transport).toEqual(
      expect.objectContaining({
        port: 2525,
        secure: false,
      }),
    );
  });

  it.each(['TRUE', 'FALSE', '1', 'yes'])(
    'parses MAIL_SECURE as a strict Boolean',
    (MAIL_SECURE) => {
      expect(() =>
        createMailerOptions(mailEnvironment({ MAIL_SECURE })),
      ).toThrow('MAIL_SECURE');
    },
  );

  it('rejects port 465 without secure transport', () => {
    expect(() =>
      createMailerOptions(
        mailEnvironment({
          MAIL_PORT: '465',
          MAIL_SECURE: 'false',
        }),
      ),
    ).toThrow('MAIL_SECURE must be true for MAIL_PORT 465');
  });

  it('rejects port 587 with implicit TLS enabled', () => {
    expect(() =>
      createMailerOptions(
        mailEnvironment({
          MAIL_PORT: '587',
          MAIL_SECURE: 'true',
        }),
      ),
    ).toThrow('MAIL_SECURE must be false for MAIL_PORT 587');
  });
});
