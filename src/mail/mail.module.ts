import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { config } from 'dotenv';
import { createMailerOptions } from './mail.config';

config({ path: '.env' });

@Module({
  imports: [MailerModule.forRoot(createMailerOptions())],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
