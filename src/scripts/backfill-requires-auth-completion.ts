import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { User } from '../users/user.schema';

/**
 * One-time backfill: set `requiresAuthCompletion: true` for any user who
 * still has the social-signup sentinel placeholder values.
 *
 * Run once after deploying the schema change. Users who landed via the
 * social-signup flow between the sentinel-defaults deploy (PR #75) and the
 * requiresAuthCompletion field deploy carry sentinel values but no flag —
 * without this backfill they would skip the auth-complete screen on their
 * next sign-in.
 *
 * The check requires all three sentinel values to match together so a real
 * user who happens to share any one of them isn't incorrectly flagged.
 *
 * Idempotent — safe to re-run.
 *
 * Usage:
 *   npm run backfill:requires-auth-completion
 */
async function backfillRequiresAuthCompletion() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const userModel = app.get<Model<User>>(getModelToken(User.name));

    const sentinelDate = new Date('1970-01-01T00:00:00Z');
    const result = await userModel
      .updateMany(
        {
          dateOfBirth: sentinelDate,
          gender: 'Female',
          onBehalf: 'Self',
          // Don't reset users who already have the flag set (idempotency).
          requiresAuthCompletion: { $ne: true },
        },
        { $set: { requiresAuthCompletion: true } },
      )
      .exec();

    console.log(
      `[backfill] matched=${result.matchedCount} modified=${result.modifiedCount}`,
    );
  } catch (error) {
    console.error('[backfill] fatal error:', error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

backfillRequiresAuthCompletion();
