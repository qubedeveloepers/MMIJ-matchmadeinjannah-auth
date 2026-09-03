# Local email-verification end-to-end procedure

This procedure must run only against disposable local MongoDB and Redis
instances. Never point `DB_URL`, `REDIS_HOST`, or `REDIS_PORT` at production.
The mailbox code must be supplied by the mailbox owner; do not read it from
Redis, MongoDB, application logs, mocks, or generated values.

## 1. Configure locally

1. Copy `.env.example` to `.env`.
2. Restrict `.env` permissions to the local owner.
3. Open `.env` in a local editor and replace every required placeholder.
4. Use a database name dedicated to this test.
5. Use a Redis instance or database dedicated to this test.
6. Enter the authorized SMTP values locally. Do not paste them into chat or
   shell commands.
7. Set `MAIL_PORT=587` with `MAIL_SECURE=false`, or set `MAIL_PORT=465` with
   `MAIL_SECURE=true`, according to the SMTP provider.

The backend `.gitignore` excludes `.env` and local dotenv variants.

In the Flutter clone:

1. Copy `.env.example` to `.env`.
2. Set `AUTH_URL` to the local backend `/auth` base URL reachable from the
   emulator or physical device.
3. Keep the file local and ignored.

## 2. Start isolated dependencies

Start fresh local MongoDB and Redis instances on ports reserved for this test.
Confirm those ports are not forwarded to production and that the configured
database is empty. Do not reuse a shared Redis instance unless a dedicated
database or isolated process is guaranteed.

Start the local backend and confirm:

- SMTP configuration validation succeeds.
- MongoDB connects to the isolated database.
- Redis connects to the isolated instance.
- Firebase or media integrations are not required for registration.

## 3. Real mailbox scenarios

Use `matchmadejannah@gmail.com` only in the disposable local database. Generate
a unique username, phone number, and other non-secret registration fields for
each scenario. Enter the local test password directly in the app without
printing or logging it.

### Delivery, incorrect code, resend, and successful verification

1. Register through the Flutter app.
2. Confirm the backend reports one SMTP acceptance without logging the
   recipient or code.
3. Ask the mailbox owner to check Inbox and Junk and type the received
   six-digit code.
4. Submit a different six-digit value first and confirm the app shows the
   invalid-code message.
5. Wait until the app reaches `00:00`.
6. Confirm `Resend Code` becomes enabled and submit one resend.
7. Confirm the backend reports a second SMTP acceptance.
8. Confirm the first owner-provided code is now rejected.
9. Ask the owner for the second code and submit only that owner-provided value.
10. Confirm verification succeeds, the user becomes active, login succeeds,
    and the app navigates to the introduction/profile setup flow.
11. Confirm the timer restarted immediately after the resend succeeded.

### Expiration

Use a fresh disposable registration. Ask the owner for the received code, but
do not submit it until more than five minutes have elapsed. Confirm the normal
verification endpoint rejects it with the expired-code message.

Because a successfully verified account is already active, incorrect and
expired signup-code behavior must be exercised while an account is still
pending. Use separate disposable local registrations or reset only the
isolated MongoDB and Redis test instances between scenarios.

## 4. Final checks and cleanup

Run the complete backend and Flutter test suites and Flutter static analysis.
Then stop the local backend and delete only the disposable local MongoDB
database and dedicated Redis data. Remove both local `.env` files after the
owner no longer needs the setup. Verify `git status` contains only intended
source and test changes.
