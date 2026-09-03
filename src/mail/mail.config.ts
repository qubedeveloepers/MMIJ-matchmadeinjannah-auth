import { MailerOptions } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { join } from 'path';

type MailEnvironment = NodeJS.ProcessEnv;

function requireMailVariable(
  environment: MailEnvironment,
  name:
    | 'MAIL_HOST'
    | 'MAIL_PORT'
    | 'MAIL_SECURE'
    | 'MAIL_USER'
    | 'MAIL_PASSWORD'
    | 'MAIL_FROM',
): string {
  const value = environment[name];

  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseMailPort(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(
      'Invalid environment variable: MAIL_PORT must be an integer',
    );
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'Invalid environment variable: MAIL_PORT must be between 1 and 65535',
    );
  }

  return port;
}

function parseMailSecure(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;

  throw new Error(
    'Invalid environment variable: MAIL_SECURE must be true or false',
  );
}

export function createMailerOptions(
  environment: MailEnvironment = process.env,
): MailerOptions {
  const host = requireMailVariable(environment, 'MAIL_HOST').trim();
  const port = parseMailPort(
    requireMailVariable(environment, 'MAIL_PORT').trim(),
  );
  const secure = parseMailSecure(
    requireMailVariable(environment, 'MAIL_SECURE').trim(),
  );
  const user = requireMailVariable(environment, 'MAIL_USER');
  const pass = requireMailVariable(environment, 'MAIL_PASSWORD');
  const from = requireMailVariable(environment, 'MAIL_FROM').trim();

  if (port === 465 && !secure) {
    throw new Error(
      'Invalid SMTP configuration: MAIL_SECURE must be true for MAIL_PORT 465',
    );
  }

  if (port === 587 && secure) {
    throw new Error(
      'Invalid SMTP configuration: MAIL_SECURE must be false for MAIL_PORT 587',
    );
  }

  return {
    transport: {
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    },
    defaults: {
      from: `"Match Made In Jannah" ${from}`,
    },
    template: {
      dir: join(__dirname, 'templates'),
      adapter: new HandlebarsAdapter(),
      options: {
        strict: true,
      },
    },
  };
}
