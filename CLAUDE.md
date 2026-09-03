# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**matchmadeinjannah-auth** is a monolithic NestJS backend service for an Islamic matrimonial platform. It handles authentication, user profiles, real-time chat, media management, admin dashboard, and push notifications.

- **Runtime:** Node.js 18 / TypeScript 5.1 / NestJS 11
- **Database:** MongoDB via Mongoose ODM
- **Auth:** JWT (Passport.js) with local + social OAuth (Google, Facebook, Apple)
- **Real-time:** WebSocket via Socket.io
- **Media:** Cloudinary (private/authenticated uploads, WebP conversion)
- **Logging:** Pino with Loki/Grafana stack
- **Deployment:** Hostinger VPS with PM2, Nginx, GitHub Actions CI/CD

## Commands

```bash
npm run start:dev       # Dev server with watch mode
npm run build           # Build TypeScript to dist/
npm run start:prod      # Run production build (node dist/main)
npm run lint            # ESLint with auto-fix
npm run format          # Prettier formatting
npm test                # Unit tests (Jest)
npm run test:watch      # Jest watch mode
npm run test:cov        # Coverage report
npm run test:e2e        # E2E tests (jest --config ./test/jest-e2e.json)
npm run create-admin    # Create admin user via ts-node script
```

Run a single test file: `npx jest --testPathPattern=<filename>`

## Architecture

### Module Structure

Each feature follows the NestJS module pattern:
```
src/<feature>/
├── <feature>.module.ts       # Module definition
├── <feature>.service.ts      # Business logic
├── <feature>.controller.ts   # HTTP routes
├── <feature>.schema.ts       # Mongoose schema
├── dtos/                     # Request/response DTOs
├── enums/                    # Feature-specific enums
└── <feature>.spec.ts         # Unit tests
```

### Core Modules

| Module | Purpose |
|--------|---------|
| `auth/` | Signup, login, JWT tokens, password reset, social OAuth, email verification |
| `users/` | User CRUD, profile management, search with OData filtering |
| `chat-room/` | WebSocket chat gateway, chat rooms, message delivery status |
| `chat-request/` | Chat initiation/approval workflow |
| `media/` | Profile picture, gallery (max 3), video uploads (50MB limit) |
| `cloudinary/` | Cloudinary integration, signed URLs, image transformations |
| `admin/` | Dashboard stats, user management, media approval workflow |
| `devices/` | FCM token registration, device tracking |
| `user-interaction/` | Saves, blocks, views, likes between users |
| `mail/` | Email via Nodemailer + Handlebars templates (`mail/templates/`) |
| `logging/` | MongoDB audit logs + Pino structured logging |
| `notifications/` | Push notifications (in development, see `src/notifications/SPEC.md`) |

### Global Providers (app.module.ts)

- **HttpExceptionFilter** (`src/filters/exception.handler.ts`): Global exception handler mapping errors to `mmij-XX` codes
- **JwtAuthGuard**: Applied globally — use `@Public()` decorator to exempt routes
- **RolesGuard**: Role-based access — use `@Roles(Role.ADMIN)` decorator

### Auth Flow

- JWT tokens expire in 30 days. Strategy extracts `email`, `_id`, `username`, `role` from payload.
- `@Public()` decorator (from `src/auth/decorators/public.decorator.ts`) marks routes as unauthenticated.
- `@Roles()` decorator (from `src/auth/decorators/roles.decorator.ts`) enforces role-based access.
- Social sign-in supports: LOCAL, GOOGLE, FACEBOOK, APPLE (`AuthType` enum).

### Error Codes

Standardized error codes are in `src/error-codes.json` (mmij-00 through mmij-35). The global exception filter returns:
```json
{ "errorCode": "mmij-XX", "message": "...", "timestamp": "...", "path": "..." }
```

### Validation

Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. Validation errors return code `mmij-19`.

## Environment Variables

Configuration is loaded from `.env` at project root (`dotenv` in app.module.ts). Key variables:
- `DB_URL` — MongoDB connection string
- `LOG_LEVEL` — Pino log level (default: `info`)
- `NODE_ENV` — Environment name
- Cloudinary, mail, and OAuth credentials are also expected in `.env`

## Key Conventions

- **Service injection:** Services use `@InjectModel()` for Mongoose models, `@InjectPinoLogger()` for logging, `@Inject(CACHE_MANAGER)` for caching.
- **Coding style:** Single quotes, trailing commas (Prettier). ESLint allows `any` types.
- **User schema** (`src/users/user.schema.ts`): Large schema with profile fields, partner preferences, media fields with `MediaApprovalStatus` (PENDING/APPROVED/REJECTED), and `UserStatus` (PENDING/ACTIVE/DELETED).
- **Cloudinary paths:** `mmij/profile_pictures/{userId}`, `mmij/gallery/{userId}`, `mmij/videos/{userId}`.
- **Multer file size limit:** 10MB default (configured in app.module.ts), 50MB for video uploads.
- **CORS:** Allowed origins are hardcoded in `src/main.ts`.
- **Port:** 3000 (hardcoded in `src/main.ts`).

## Logging Stack

The `logging-stack/` directory contains a Docker Compose setup for Loki + Promtail + Grafana (Grafana on port 3001, Loki on port 3100).

## CI/CD

GitHub Actions (`.github/workflows/deploy.yml`) deploys on push to `main`: SSH into VPS, `git pull`, `npm install`, `npm run build`, `pm2 restart`.
