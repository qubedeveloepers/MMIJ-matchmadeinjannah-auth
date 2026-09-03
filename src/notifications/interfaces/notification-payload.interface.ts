import { NotificationType } from '../notifications.constants';

export interface NotificationPayload {
  title: string;
  body: string;
  data: {
    type: NotificationType;
    chatRoomId?: string;
    chatRequestId?: string;
    senderId?: string;
    mediaType?: 'profilePicture' | 'galleryPhoto' | 'profileVideo';
    reason?: string;
  };
}

export interface PushJobData {
  userId: string;
  fcmToken: string;
  payload: NotificationPayload;
  collapseKey?: string;
}

export interface NotificationEvent {
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: {
    senderId?: string;
    chatRoomId?: string;
    chatRequestId?: string;
    mediaType?: 'profilePicture' | 'galleryPhoto' | 'profileVideo';
    reason?: string;
  };
  collapseKey?: string;
}
