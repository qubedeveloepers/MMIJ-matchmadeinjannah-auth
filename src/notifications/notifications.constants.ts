export const PUSH_QUEUE_NAME = 'push-notifications';
export const PUSH_JOB_NAME = 'send-push';
export const FIREBASE_ADMIN_MESSAGING = 'FIREBASE_ADMIN_MESSAGING';
export const NOTIFICATION_TITLE = 'Match Made in Jannah';

export enum NotificationType {
  CHAT_REQUEST = 'CHAT_REQUEST',
  CHAT_REQUEST_ACCEPTED = 'CHAT_REQUEST_ACCEPTED',
  CHAT_MESSAGE = 'CHAT_MESSAGE',
  CHAT_REQUEST_REJECTED = 'CHAT_REQUEST_REJECTED',
  MEDIA_APPROVED = 'MEDIA_APPROVED',
  MEDIA_REJECTED = 'MEDIA_REJECTED',
  PROFILE_COMPLETE = 'PROFILE_COMPLETE',
}

export const NotificationTemplates = {
  [NotificationType.CHAT_REQUEST]: (name: string) =>
    `${name} sent you a chat request`,
  [NotificationType.CHAT_REQUEST_ACCEPTED]: (name: string) =>
    `${name} accepted your chat request`,
  [NotificationType.CHAT_MESSAGE]: (name: string, count: number) =>
    count > 1
      ? `${name} sent you ${count} new messages`
      : `${name} sent you a new message`,
  [NotificationType.CHAT_REQUEST_REJECTED]: (name: string) =>
    `${name} declined your chat request`,
  [NotificationType.MEDIA_APPROVED]: (mediaType: string) =>
    `Your ${mediaType} has been approved`,
  [NotificationType.MEDIA_REJECTED]: (mediaType: string, reason: string) =>
    `Your ${mediaType} was rejected: ${reason}`,
  [NotificationType.PROFILE_COMPLETE]: () =>
    'Congratulations! Your profile is 100% complete',
};

export type NotificationChannel = 'push' | 'inApp' | 'email';

export const NotificationChannels: Record<NotificationType, NotificationChannel[]> = {
  [NotificationType.CHAT_REQUEST]:          ['push'],
  [NotificationType.CHAT_REQUEST_ACCEPTED]: ['push'],
  [NotificationType.CHAT_MESSAGE]:          ['push'],
  [NotificationType.CHAT_REQUEST_REJECTED]: ['push'],
  [NotificationType.MEDIA_APPROVED]:        ['push', 'email'],
  [NotificationType.MEDIA_REJECTED]:        ['push', 'email'],
  [NotificationType.PROFILE_COMPLETE]:      ['push', 'email'],
};
