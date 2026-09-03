# Technical Specification: FCM Push Notification System

## 1. Overview

Implementation of a robust, queue-based push notification system using **Firebase Cloud Messaging (FCM)** and **Nest.js**. The system handles transient failures via **BullMQ** with exponential back-off and maintains a healthy device registry by pruning stale or invalid tokens.

## 2. Technical Stack

* **Backend:** Nest.js (Monolith)
* **Database:** MongoDB (via Mongoose)
* **Queue/Cache:** Redis + BullMQ
* **SDK:** `firebase-admin`
* **Retry Strategy:** Exponential Back-off (managed by BullMQ)

---

## 3. Data Models & Constants

### 3.1 Device Schema (Updated Logic)

The `Device` collection uses `firebaseInstallationId` as the unique identifier.

* **Staleness Policy:** Any token not updated within **60 days** is automatically deleted via MongoDB TTL index.
* **Validation:** Tokens are validated against FCM on every send; invalid tokens are deleted immediately.

### 3.2 Notification Payload Interface

```typescript
export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>; // Values must be strings for FCM
  priority?: 'high' | 'normal';
}

export interface PushJobData {
  userId: string;
  fcmToken: string;
  payload: NotificationPayload;
}

```

---

## 4. System Architecture

### 4.1 Trigger Logic (The Producer)

The `NotificationService` acts as the internal entry point.

1. **Lookup:** Find all active devices associated with a `userId`.
2. **Filter:** Ensure `updatedAt` is within the "staleness window" (though primary cleanup happens on FCM error).
3. **Fan-out:** For every device found, create an individual job in the `push-notifications` queue.

### 4.2 Worker Logic (The Consumer)

The BullMQ Processor handles the actual delivery:

1. **Initialize:** Use `firebase-admin` SDK.
2. **Attempt Send:** Call `messaging().send()`.
3. **Error Handling:**
* **Transient Errors (5xx, Timeout):** Throw error to trigger BullMQ's exponential back-off.
* **Invalid Token Errors:** (`messaging/registration-token-not-registered` or `messaging/invalid-registration-token`). Immediately delete the `Device` document from MongoDB. Do **not** retry.
* **Other Errors:** Log for observability.



---

## 5. Implementation Plan

### Phase 1: Infrastructure Setup

1. Install dependencies: `npm install bullmq @nestjs/bullmq firebase-admin`.
2. Configure `BullModule` in `AppModule` pointing to the VPS Redis instance.
3. Initialize `firebase-admin` using service account credentials.

### Phase 2: The Producer (Internal Service)

1. Create `NotificationService.sendToUser(userId: string, payload: NotificationPayload)`.
2. Query `DeviceModel` for all tokens matching `userId`.
3. Enqueue jobs:
```typescript
await this.pushQueue.add('send-notification', jobData, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s, 4s, 8s, 16s...
  },
});

```



### Phase 3: The Consumer (Processor)

1. Create `PushNotificationProcessor`.
2. Implement `process()` method to wrap the FCM call in a `try/catch` block.
3. Implement the deletion logic for stale tokens based on FCM error codes.

### Phase 4: Maintenance

1. Ensure the MongoDB index `expireAfterSeconds: 5184000` is active on the `updatedAt` field.
2. Expose an internal `POST /register-token` to update the `updatedAt` timestamp whenever the Flutter app starts.

---

## 6. Success Criteria

* **Reliability:** Temporary network drops to Google APIs do not lose notifications.
* **Efficiency:** Stale tokens are automatically purged, keeping the DB lean.
* **Observability:** Each notification attempt is tracked as a discrete BullMQ job.