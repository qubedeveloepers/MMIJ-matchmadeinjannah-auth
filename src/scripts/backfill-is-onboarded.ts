import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { User } from '../users/user.schema';
import { UsersService } from '../users/users.service';

/**
 * One-time backfill: compute and persist `isOnboarded` for every user.
 *
 * Run after deploying the schema change that introduces the stored
 * `isOnboarded` field but before activating the discovery/listing query
 * filters that rely on it. The script is idempotent — safe to re-run.
 *
 * Usage:
 *   npm run backfill:is-onboarded
 */
async function backfillIsOnboarded() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const usersService = app.get(UsersService);
    const userModel = app.get<Model<User>>(getModelToken(User.name));

    const total = await userModel.estimatedDocumentCount();
    console.log(`[backfill] starting; ~${total} users to process`);

    let processed = 0;
    let updated = 0;
    let errors = 0;

    // Cursor-stream so we don't load everything into memory at once.
    const cursor = userModel.find({}, { _id: 1, isOnboarded: 1 }).cursor();

    for await (const userDoc of cursor) {
      const userId = userDoc._id.toString();
      try {
        const { isOnboarded } =
          await usersService.getProfileCompletionStatus(userId);

        // Skip the write if the stored value already matches.
        if (userDoc.isOnboarded === isOnboarded) {
          processed++;
          continue;
        }

        await userModel
          .updateOne({ _id: userDoc._id }, { $set: { isOnboarded } })
          .exec();
        updated++;
      } catch (err) {
        errors++;
        console.error(`[backfill] error for user ${userId}:`, err);
      } finally {
        processed++;
        if (processed % 100 === 0) {
          console.log(
            `[backfill] progress ${processed}/${total} (updated=${updated} errors=${errors})`,
          );
        }
      }
    }

    console.log(
      `[backfill] done. processed=${processed} updated=${updated} errors=${errors}`,
    );
  } catch (error) {
    console.error('[backfill] fatal error:', error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

backfillIsOnboarded();
