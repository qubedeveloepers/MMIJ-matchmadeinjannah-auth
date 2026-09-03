import { Logger, Provider } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FIREBASE_ADMIN_MESSAGING } from './notifications.constants';

export const FirebaseAdminProvider: Provider = {
  provide: FIREBASE_ADMIN_MESSAGING,
  useFactory: (): admin.messaging.Messaging | null => {
    const logger = new Logger('FirebaseAdminProvider');

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    logger.log(
      `Firebase env check — FIREBASE_PROJECT_ID: ${projectId ? 'SET' : 'MISSING'}, FIREBASE_CLIENT_EMAIL: ${clientEmail ? 'SET' : 'MISSING'}, FIREBASE_PRIVATE_KEY: ${privateKey ? 'SET' : 'MISSING'}`,
    );

    if (!projectId || !clientEmail || !privateKey) {
      logger.warn(
        `Firebase credentials missing — push notifications DISABLED. Missing: ${[!projectId && 'FIREBASE_PROJECT_ID', !clientEmail && 'FIREBASE_CLIENT_EMAIL', !privateKey && 'FIREBASE_PRIVATE_KEY'].filter(Boolean).join(', ')}`,
      );
      return null;
    }

    try {
      const app = admin.apps.length
        ? admin.app()
        : admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey,
            }),
          });

      logger.log(
        `Firebase Admin SDK initialized (projectId=${projectId}, reused=${admin.apps.length > 1})`,
      );
      return app.messaging();
    } catch (error) {
      logger.error(
        `Firebase Admin SDK initialization FAILED: ${error?.message}`,
      );
      return null;
    }
  },
};
