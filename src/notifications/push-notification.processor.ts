import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import * as admin from 'firebase-admin';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DevicesService } from 'src/devices/devices.service';
import { PushJobData } from './interfaces/notification-payload.interface';
import {
  FIREBASE_ADMIN_MESSAGING,
  PUSH_QUEUE_NAME,
} from './notifications.constants';

const INVALID_TOKEN_CODES = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
];

@Processor(PUSH_QUEUE_NAME)
export class PushNotificationProcessor extends WorkerHost {
  constructor(
    @Inject(FIREBASE_ADMIN_MESSAGING)
    private readonly messaging: admin.messaging.Messaging | null,
    private readonly devicesService: DevicesService,
    @InjectPinoLogger(PushNotificationProcessor.name)
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job<PushJobData>): Promise<void> {
    this.logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        userId: job.data.userId,
        type: job.data.payload?.data?.type,
        fcmTokenTail: job.data.fcmToken?.slice(-8),
      },
      '[PushProcessor] Job received',
    );

    if (!this.messaging) {
      this.logger.warn(
        { jobId: job.id, userId: job.data.userId },
        '[PushProcessor] Firebase messaging is NULL — Firebase not initialized. Check FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env vars. Job dropped.',
      );
      return;
    }

    const { fcmToken, payload, collapseKey } = job.data;

    const dataRecord: Record<string, string> = {
      type: payload.data.type,
      senderId: payload.data.senderId,
    };
    if (payload.data.chatRoomId) {
      dataRecord.chatRoomId = payload.data.chatRoomId;
    }
    if (payload.data.chatRequestId) {
      dataRecord.chatRequestId = payload.data.chatRequestId;
    }

    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: dataRecord,
      android: {
        collapseKey: collapseKey,
        notification: {
          channelId: 'mmij_chat',
        },
      },
      apns: {
        headers: {
          ...(collapseKey && { 'apns-collapse-id': collapseKey }),
        },
        payload: {
          aps: {
            'thread-id': collapseKey,
            sound: 'default',
          },
        },
      },
    };

    this.logger.info(
      {
        jobId: job.id,
        userId: job.data.userId,
        type: payload.data.type,
        title: payload.title,
        body: payload.body,
        fcmTokenTail: fcmToken?.slice(-8),
        collapseKey,
        dataRecord,
      },
      '[PushProcessor] Sending FCM message',
    );

    try {
      const messageId = await this.messaging.send(message);
      this.logger.info(
        {
          jobId: job.id,
          userId: job.data.userId,
          type: payload.data.type,
          messageId,
        },
        '[PushProcessor] FCM message sent successfully',
      );
    } catch (error) {
      this.logger.error(
        {
          jobId: job.id,
          userId: job.data.userId,
          fcmTokenTail: fcmToken?.slice(-8),
          errorCode: error?.code,
          errorMessage: error?.message,
        },
        '[PushProcessor] FCM send failed',
      );
      if (INVALID_TOKEN_CODES.includes(error?.code)) {
        this.logger.warn(
          { fcmTokenTail: fcmToken?.slice(-8), errorCode: error.code },
          '[PushProcessor] Invalid FCM token — removing device',
        );
        await this.devicesService.deleteByFcmToken(fcmToken);
        return;
      }
      throw error;
    }
  }
}
