import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DevicesService } from 'src/devices/devices.service';
import { MailService } from 'src/mail/mail.service';
import { Message } from 'src/message/message.schema';
import { User } from 'src/users/user.schema';
import {
  NOTIFICATION_TITLE,
  NotificationChannels,
  NotificationTemplates,
  NotificationType,
  PUSH_JOB_NAME,
  PUSH_QUEUE_NAME,
} from './notifications.constants';
import {
  NotificationEvent,
  NotificationPayload,
} from './interfaces/notification-payload.interface';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue(PUSH_QUEUE_NAME) private readonly pushQueue: Queue,
    private readonly devicesService: DevicesService,
    private readonly mailService: MailService,
    @InjectModel(Message.name) private readonly messageModel: Model<Message>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectPinoLogger(NotificationsService.name)
    private readonly logger: PinoLogger,
  ) {}

  // ─── Central dispatcher ────────────────────────────────────────────────────

  private async notify(event: NotificationEvent): Promise<void> {
    const channels = NotificationChannels[event.type];

    // Phase 1: push only
    if (channels.includes('push')) {
      const payload: NotificationPayload = {
        title: event.title,
        body: event.body,
        data: { type: event.type, ...event.data },
      };
      await this.sendToUser(event.recipientUserId, payload, event.collapseKey);
    }

    // Phase 2: email
    if (channels.includes('email')) {
      await this.sendEmailForEvent(event);
    }

    // Phase 3: inApp — will be added here
  }

  // ─── Internal push delivery ────────────────────────────────────────────────

  async sendToUser(
    recipientUserId: string,
    payload: NotificationPayload,
    collapseKey?: string,
  ): Promise<void> {
    this.logger.info(
      { recipientUserId, type: payload.data.type },
      '[Notifications] sendToUser called',
    );
    try {
      const devices = await this.devicesService.findByUserId(recipientUserId);
      this.logger.info(
        { recipientUserId, deviceCount: devices.length },
        '[Notifications] devices found for recipient',
      );

      if (!devices.length) {
        this.logger.warn(
          { recipientUserId, type: payload.data.type },
          '[Notifications] No registered devices for recipient — push notification skipped',
        );
        return;
      }

      const jobs = devices.map((device) => ({
        name: PUSH_JOB_NAME,
        data: {
          userId: recipientUserId,
          fcmToken: device.fcmToken,
          payload,
          collapseKey,
        },
        opts: {
          attempts: 5,
          backoff: { type: 'exponential' as const, delay: 2000 },
        },
      }));

      this.logger.info(
        { recipientUserId, type: payload.data.type, jobCount: jobs.length },
        '[Notifications] Enqueuing push jobs',
      );
      await this.pushQueue.addBulk(jobs);
      this.logger.info(
        {
          recipientUserId,
          type: payload.data.type,
          deviceCount: devices.length,
        },
        '[Notifications] Push jobs enqueued successfully',
      );
    } catch (error) {
      this.logger.error(
        { error, recipientUserId, type: payload.data.type },
        '[Notifications] Failed to enqueue push notifications',
      );
    }
  }

  // ─── Chat notifications ────────────────────────────────────────────────────

  async notifyChatRequest(
    receiverUserId: string,
    senderName: string,
    senderId: string,
    chatRequestId: string,
  ): Promise<void> {
    this.logger.info(
      { receiverUserId, senderId, chatRequestId, senderName },
      '[Notifications] notifyChatRequest called',
    );
    await this.notify({
      recipientUserId: receiverUserId,
      type: NotificationType.CHAT_REQUEST,
      title: NOTIFICATION_TITLE,
      body: NotificationTemplates[NotificationType.CHAT_REQUEST](senderName),
      data: { senderId, chatRequestId },
    });
  }

  async notifyChatRequestAccepted(
    senderUserId: string,
    accepterName: string,
    accepterId: string,
    chatRequestId: string,
    chatRoomId: string,
  ): Promise<void> {
    await this.notify({
      recipientUserId: senderUserId,
      type: NotificationType.CHAT_REQUEST_ACCEPTED,
      title: NOTIFICATION_TITLE,
      body: NotificationTemplates[NotificationType.CHAT_REQUEST_ACCEPTED](
        accepterName,
      ),
      data: { senderId: accepterId, chatRequestId, chatRoomId },
    });
  }

  async notifyChatRequestRejected(
    senderUserId: string,
    rejecterName: string,
    rejecterId: string,
    chatRequestId: string,
  ): Promise<void> {
    await this.notify({
      recipientUserId: senderUserId,
      type: NotificationType.CHAT_REQUEST_REJECTED,
      title: NOTIFICATION_TITLE,
      body: NotificationTemplates[NotificationType.CHAT_REQUEST_REJECTED](
        rejecterName,
      ),
      data: { senderId: rejecterId, chatRequestId },
    });
  }

  async notifyNewMessage(
    recipientUserId: string,
    senderName: string,
    senderId: string,
    chatRoomId: string,
  ): Promise<void> {
    const unreadCount = await this.getUnreadCount(recipientUserId, chatRoomId);
    const collapseKey = `chat_${chatRoomId}`;

    await this.notify({
      recipientUserId,
      type: NotificationType.CHAT_MESSAGE,
      title: NOTIFICATION_TITLE,
      body: NotificationTemplates[NotificationType.CHAT_MESSAGE](
        senderName,
        unreadCount,
      ),
      data: { senderId, chatRoomId },
      collapseKey,
    });
  }

  // ─── Media notifications ───────────────────────────────────────────────────

  async notifyMediaApproved(
    userId: string,
    mediaType: 'profilePicture' | 'galleryPhoto' | 'profileVideo',
  ): Promise<void> {
    const humanReadable = this.humanReadableMediaType(mediaType);
    await this.notify({
      recipientUserId: userId,
      type: NotificationType.MEDIA_APPROVED,
      title: NOTIFICATION_TITLE,
      body: NotificationTemplates[NotificationType.MEDIA_APPROVED](
        humanReadable,
      ),
      data: { mediaType },
    });
  }

  async notifyMediaRejected(
    userId: string,
    mediaType: 'profilePicture' | 'galleryPhoto' | 'profileVideo',
    reason: string,
  ): Promise<void> {
    const humanReadable = this.humanReadableMediaType(mediaType);
    await this.notify({
      recipientUserId: userId,
      type: NotificationType.MEDIA_REJECTED,
      title: NOTIFICATION_TITLE,
      body: NotificationTemplates[NotificationType.MEDIA_REJECTED](
        humanReadable,
        reason,
      ),
      data: { mediaType, reason },
    });
  }

  // ─── Profile completion notification ──────────────────────────────────────

  async notifyProfileComplete(userId: string): Promise<void> {
    const user = await this.userModel
      .findById(userId)
      .select('profileCompleteNotificationSent')
      .lean();

    if (!user || user.profileCompleteNotificationSent) {
      return;
    }

    await this.notify({
      recipientUserId: userId,
      type: NotificationType.PROFILE_COMPLETE,
      title: NOTIFICATION_TITLE,
      body: NotificationTemplates[NotificationType.PROFILE_COMPLETE](),
      data: {},
    });

    await this.userModel.updateOne(
      { _id: userId },
      { profileCompleteNotificationSent: true },
    );
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async sendEmailForEvent(event: NotificationEvent): Promise<void> {
    try {
      const user = await this.userModel
        .findById(event.recipientUserId)
        .select('email firstName')
        .lean();

      if (!user?.email) {
        this.logger.warn(
          { recipientUserId: event.recipientUserId },
          '[Notifications] No email found for user — email skipped',
        );
        return;
      }

      switch (event.type) {
        case NotificationType.MEDIA_APPROVED:
          await this.mailService.sendMediaApprovedEmail(
            user,
            this.humanReadableMediaType(event.data.mediaType),
          );
          break;
        case NotificationType.MEDIA_REJECTED:
          await this.mailService.sendMediaRejectedEmail(
            user,
            this.humanReadableMediaType(event.data.mediaType),
            event.data.reason ?? '',
          );
          break;
        case NotificationType.PROFILE_COMPLETE:
          await this.mailService.sendProfileCompleteEmail(user);
          break;
        default:
          break;
      }
    } catch (error) {
      this.logger.error(
        { error, recipientUserId: event.recipientUserId, type: event.type },
        '[Notifications] sendEmailForEvent failed',
      );
    }
  }

  private humanReadableMediaType(
    mediaType: 'profilePicture' | 'galleryPhoto' | 'profileVideo',
  ): string {
    const map: Record<string, string> = {
      profilePicture: 'profile picture',
      galleryPhoto: 'gallery photo',
      profileVideo: 'profile video',
    };
    return map[mediaType] ?? mediaType;
  }

  private async getUnreadCount(
    userId: string,
    chatRoomId: string,
  ): Promise<number> {
    try {
      const count = await this.messageModel.countDocuments({
        chatRoomId: new Types.ObjectId(chatRoomId),
        'sender.id': { $ne: new Types.ObjectId(userId) },
        isDeleted: { $ne: true },
        'readBy.userId': { $ne: new Types.ObjectId(userId) },
      });
      return count || 1;
    } catch (error) {
      this.logger.error(
        { error, userId, chatRoomId },
        'Failed to get unread count',
      );
      return 1;
    }
  }
}
