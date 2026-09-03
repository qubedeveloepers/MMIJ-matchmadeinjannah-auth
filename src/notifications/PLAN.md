# FCM Push Notification System — Implementation Plan

## Summary

Add a BullMQ-based push notification system using Firebase Cloud Messaging (FCM). Three triggers: new chat request, chat request accepted, and new chat message. Messages collapse per conversation with unread count.

---

## Prerequisites (Manual Steps)

### 1. Install Dependencies
```bash
npm install firebase-admin bullmq @nestjs/bullmq
```

### 2. Redis Setup
**macOS (local dev):**
```bash
brew install redis && brew services start redis
```
**Hostinger VPS:**
```bash
sudo apt update && sudo apt install redis-server -y
sudo systemctl enable redis-server && sudo systemctl start redis-server
```

### 3. Firebase Service Account Key
1. Firebase Console → Project Settings → Service accounts → Generate new private key
2. Extract `project_id`, `client_email`, `private_key` from downloaded JSON

### 4. Environment Variables (add to `.env`)
```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
FIREBASE_PROJECT_ID=<from service account>
FIREBASE_CLIENT_EMAIL=<from service account>
FIREBASE_PRIVATE_KEY="<from service account>"
```

---

## Files to Create

### `src/notifications/notifications.constants.ts`
- `PUSH_QUEUE_NAME = 'push-notifications'`
- `PUSH_JOB_NAME = 'send-notification'`
- `FIREBASE_ADMIN_MESSAGING` injection token
- `NotificationType` enum: `CHAT_REQUEST`, `CHAT_REQUEST_ACCEPTED`, `CHAT_MESSAGE`
- `NOTIFICATION_TITLE = 'MatchMade in Jannah'`
- `NotificationTemplates` — functions mapping type → body string:
  - CHAT_REQUEST: `"{name} sent you a chat request"`
  - CHAT_REQUEST_ACCEPTED: `"{name} accepted your chat request"`
  - CHAT_MESSAGE: `"New message from {name}"` or `"{count} new messages from {name}"`

### `src/notifications/interfaces/notification-payload.interface.ts`
- `NotificationPayload`: `{ title, body, data: { type, chatRoomId?, chatRequestId?, senderId } }`
- `PushJobData`: `{ userId, fcmToken, payload, collapseKey? }`

### `src/notifications/firebase-admin.provider.ts`
- Custom NestJS provider (useFactory) that initializes `firebase-admin` SDK
- Reads `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` from env
- Returns `admin.messaging.Messaging` instance or `null` if credentials missing
- Graceful degradation: logs warning and returns `null` when credentials absent (dev environment)

### `src/notifications/notifications.service.ts` (Producer)
- Injects: `@InjectQueue(PUSH_QUEUE_NAME)`, `DevicesService`, `@InjectModel(Message.name)`, `PinoLogger`
- **`sendToUser(recipientUserId, payload, collapseKey?)`**: Looks up devices via `devicesService.findByUserId()`, enqueues one BullMQ job per device with `addBulk()`. Job config: 5 attempts, exponential backoff starting at 2s. Catches all errors silently (never breaks the caller).
- **`notifyChatRequest(receiverUserId, senderName, senderId, chatRequestId)`**: Builds payload and calls `sendToUser`
- **`notifyChatRequestAccepted(senderUserId, accepterName, accepterId, chatRequestId, chatRoomId)`**: Builds payload and calls `sendToUser`
- **`notifyNewMessage(recipientUserId, senderName, senderId, chatRoomId)`**: Queries unread count from Message collection, uses `collapseKey = chat_{chatRoomId}`, calls `sendToUser`
- **`getUnreadCount(userId, chatRoomId)`** (private): Counts messages in room where sender is not userId, not deleted, and userId not in `readBy` array. Falls back to 1 on error.

**Unread count query** (must use ObjectId since `chatRoomId` and `sender.id` are `Types.ObjectId` in Message schema):
```typescript
await this.messageModel.countDocuments({
  chatRoomId: new Types.ObjectId(chatRoomId),
  'sender.id': { $ne: new Types.ObjectId(userId) },
  isDeleted: { $ne: true },
  'readBy.userId': { $ne: new Types.ObjectId(userId) },
});
```

### `src/notifications/push-notification.processor.ts` (Consumer)
- Extends `WorkerHost`, decorated with `@Processor(PUSH_QUEUE_NAME)`
- Injects: `FIREBASE_ADMIN_MESSAGING` (Messaging | null), `DevicesService`, `PinoLogger`
- **`process(job)`**: If messaging is null, return (no-op). Build FCM message with:
  - `notification` field (title + body) for OS-level display
  - `data` field (stringified, no undefined values) for client navigation
  - `android.collapseKey` + `android.notification.channelId = 'mmij_chat'`
  - `apns.headers['apns-collapse-id']` + `apns.payload.aps.thread-id` + `sound: 'default'`
- **Error handling:**
  - Invalid token (`messaging/registration-token-not-registered`, `messaging/invalid-registration-token`, `messaging/invalid-argument`): call `devicesService.deleteByFcmToken()`, return without throwing (no retry)
  - Transient errors: throw to trigger BullMQ exponential backoff

### `src/notifications/notifications.module.ts`
- Imports: `BullModule.registerQueue({ name: PUSH_QUEUE_NAME })`, `MongooseModule.forFeature([Message])`, `DevicesModule`
- Providers: `FirebaseAdminProvider`, `NotificationService`, `PushNotificationProcessor`
- Exports: `NotificationService`

---

## Files to Modify

### `src/devices/devices.service.ts`
Add two methods after `update()` (after line 72):

**`findByUserId(userId: string): Promise<Device[]>`**
- Returns `[]` if userId is empty/null
- Queries `this.deviceModel.find({ userId }).exec()`

**`deleteByFcmToken(fcmToken: string): Promise<void>`**
- Calls `this.deviceModel.deleteOne({ fcmToken }).exec()`
- Logs result, catches and logs errors internally

### `src/app.module.ts`
- Add import: `BullModule` from `@nestjs/bullmq`
- Add import: `NotificationsModule`
- Add to imports array (after `CacheModule.register()`):
  ```typescript
  BullModule.forRoot({
    connection: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    },
  }),
  ```
- Add `NotificationsModule` to imports array

### `src/chat-room/chat.module.ts`
- Add import: `NotificationsModule`
- Add `NotificationsModule` to the `imports` array (line 27)

### `src/chat-room/chat.gateway.ts`
- Add import: `NotificationService`
- Add to constructor: `private readonly notificationService: NotificationService`

**In `handleSendChatRequest` (after line 152, after WebSocket emit):**
```typescript
const senderDisplayName = senderInfo.firstName || senderInfo.username;
await this.notificationService.notifyChatRequest(
  data.receiverId,
  senderDisplayName,
  client.userId,
  chatRequest._id.toString(),
);
```
Note: `senderInfo` is already fetched on line 140.

**In `handleAcceptChatRequest` (after line 251, after both WebSocket emits):**
```typescript
const accepterInfo = await this.userService.findById(client.userId);
const accepterDisplayName = accepterInfo.firstName || accepterInfo.username;
const senderUserId = result.chatRequest.sender.id.toString();
await this.notificationService.notifyChatRequestAccepted(
  senderUserId,
  accepterDisplayName,
  client.userId,
  data.requestId,
  result.chatRoom._id.toString(),
);
```

**In `handleMessage` (after line 123, after delivery marking loop):**
```typescript
const senderInfo = await this.userService.findById(client.userId);
const senderDisplayName = senderInfo.firstName || senderInfo.username;
for (const participant of otherParticipants) {
  await this.notificationService.notifyNewMessage(
    participant.id.toString(),
    senderDisplayName,
    client.userId,
    data.chatRoomId,
  );
}
```
Note: `otherParticipants` are `ChatParticipant` objects — use `.id.toString()`.

---

## Implementation Order

1. `src/notifications/notifications.constants.ts` (no dependencies)
2. `src/notifications/interfaces/notification-payload.interface.ts` (depends on constants)
3. `src/notifications/firebase-admin.provider.ts` (depends on constants)
4. `src/devices/devices.service.ts` — add `findByUserId` + `deleteByFcmToken`
5. `src/notifications/push-notification.processor.ts` (depends on 1-4)
6. `src/notifications/notifications.service.ts` (depends on 1-4)
7. `src/notifications/notifications.module.ts` (depends on 3, 5, 6)
8. `src/app.module.ts` — add BullModule.forRoot + NotificationsModule
9. `src/chat-room/chat.module.ts` — add NotificationsModule import
10. `src/chat-room/chat.gateway.ts` — inject service + add calls in 3 handlers

---

## Design Decisions (Confirmed)

| Decision | Choice |
|----------|--------|
| Triggers | Chat request, accepted, new message only |
| Queue | BullMQ + Redis (as per SPEC.md) |
| Persistence | Push-only now; interface supports future inbox |
| Dedup | Always send FCM (no WebSocket check) |
| Message collapse | FCM collapse_key per chatRoomId; query DB for unread count |
| Privacy | Name only, no message preview |
| Localization | Hardcoded English |
| FCM type | Notification + data payload |
| Hook location | ChatGateway WebSocket handlers |
| Data payload | type + chatRoomId/chatRequestId + senderId |
| Device lookup | Via DevicesService.findByUserId() |
| Monitoring | Pino logs only |
| Testing | Implementation only |

---

## Verification

1. **Build check:** `npm run build` — no TypeScript errors
2. **Redis:** `redis-cli ping` returns `PONG`
3. **Startup log:** Look for "Firebase Admin SDK initialized successfully" (or warning if creds missing)
4. **Chat request notification:** Register device for User B → User A sends chat request → check Pino logs for "Push notification jobs enqueued" with `type: CHAT_REQUEST`
5. **Accept notification:** User B accepts → logs show enqueue for User A with `type: CHAT_REQUEST_ACCEPTED`
6. **Message notification:** Send messages in a room → logs show enqueue with `type: CHAT_MESSAGE` and unread count
7. **Collapse:** Send multiple messages → notification body updates to "{N} new messages from {name}"
8. **No devices:** Trigger notification for user with no devices → debug log "No devices found", no errors
9. **Invalid token:** Set garbage fcmToken → logs show "Invalid FCM token detected, deleting device"
10. **Redis down:** Stop Redis → notification enqueue fails silently, WebSocket still works
