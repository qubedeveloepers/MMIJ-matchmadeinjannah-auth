# Cloudinary Migration Guide (Secure Implementation)

This guide outlines the complete process for migrating from local file storage to Cloudinary for the MatchMadeInJannah backend, with a **privacy-first approach** suitable for sensitive user media.

---

## Table of Contents

1. [Overview](#overview)
2. [Security Architecture](#security-architecture)
3. [Your Tasks (Manual Steps)](#your-tasks-manual-steps)
4. [Code Changes (Automated)](#code-changes-automated)
5. [API Changes Summary](#api-changes-summary)
6. [Environment Variables](#environment-variables)
7. [Testing Checklist](#testing-checklist)
8. [Rollback Plan](#rollback-plan)

---

## Overview

### Current State
- Files stored locally using `process.cwd()/uploads/{userId}/{type}/`
- Images compressed using `sharp` before storage
- Different `process.cwd()` between local and hosted environments causes conflicts
- Media returned as base64 strings to frontend

### Target State
- All media stored securely in Cloudinary with **authenticated delivery type**
- Cloudinary URLs are **never exposed to clients**
- Backend acts as a secure proxy: fetches from Cloudinary → returns base64 to client
- Same storage accessible from both local and production environments
- **No frontend changes required** - same base64 response format

### Benefits
- ✅ **Maximum Privacy** - Cloudinary URLs never exposed to clients
- ✅ **Consistent storage** across all environments (solves your original problem)
- ✅ **Backend controls all access** - can enforce auth checks before serving media
- ✅ Automatic image optimization by Cloudinary
- ✅ 10GB free storage, 20GB bandwidth/month
- ✅ Reduced server disk usage
- ✅ **No frontend changes needed** - same API response format

---

## Security Architecture

### How It Works

```
┌─────────────┐      ┌─────────────────┐      ┌─────────────┐
│   Client    │      │  Your Backend   │      │  Cloudinary │
│  (Mobile/   │      │   (NestJS)      │      │   (Cloud)   │
│   Web App)  │      │                 │      │             │
└──────┬──────┘      └────────┬────────┘      └──────┬──────┘
       │                      │                      │
       │  1. Request media    │                      │
       │ ──────────────────►  │                      │
       │                      │  2. Fetch with       │
       │                      │     authenticated    │
       │                      │     credentials      │
       │                      │ ──────────────────►  │
       │                      │                      │
       │                      │  3. Return image     │
       │                      │ ◄──────────────────  │
       │                      │                      │
       │  4. Return base64    │                      │
       │ ◄──────────────────  │                      │
       │                      │                      │
```

### Security Layers

| Layer | Protection |
|-------|------------|
| **Upload** | Files uploaded with `type: 'authenticated'` - requires signed URLs to access |
| **Storage** | Only `public_id` stored in database, not URLs |
| **Retrieval** | Backend fetches using API credentials, converts to base64 |
| **Delivery** | Client receives base64 only - no Cloudinary URLs exposed |
| **Access Control** | Your existing JWT auth protects all media endpoints |

### Why This Approach?

For a matrimonial/dating app with sensitive user photos:

- ❌ **Public URLs** - Anyone with the link can view (bad for privacy)
- ❌ **Signed URLs with expiry** - Still exposes URL structure, can be shared during validity
- ✅ **Backend proxy with base64** - URLs never leave your server, maximum privacy

---

## Your Tasks (Manual Steps)

### Step 1: Create Cloudinary Account

1. Go to [https://cloudinary.com/users/register_free](https://cloudinary.com/users/register_free)
2. Sign up with Google, GitHub, or email
3. Verify your email if required
4. **No credit card required** for free tier

### Step 2: Get Your Cloudinary Credentials

1. After login, go to your [Cloudinary Dashboard](https://console.cloudinary.com/console)
2. Find the **"Programmable Media"** section (or look for "API Keys")
3. Copy the following credentials:
   - **Cloud Name** (e.g., `dxxxxx`)
   - **API Key** (e.g., `123456789012345`)
   - **API Secret** (e.g., `abcdefghijk...`)

### Step 3: Enable Strict Transformations (Recommended)

To prevent URL manipulation attacks:

1. Go to **Settings** → **Security**
2. Enable **"Strict Transformations"**
3. This ensures only pre-defined transformations can be applied

### Step 4: Update Environment Variables

Add these to your `.env` file (both local and production):

```env
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Step 5: Update Production Environment

1. SSH into your Hostinger VPS
2. Update the `.env` file with the same Cloudinary credentials
3. Restart the application after code deployment

---

## Code Changes (Automated)

The following changes will be made by Claude:

### Phase 1: Setup
- [ ] Install Cloudinary SDK (`cloudinary` package)
- [ ] Create Cloudinary configuration module
- [ ] Create CloudinaryService with:
  - `uploadImage()` - uploads with `type: 'authenticated'`
  - `uploadVideo()` - uploads videos with `type: 'authenticated'`
  - `deleteAsset()` - deletes by public_id
  - `getAssetAsBase64()` - fetches and converts to base64 (key for privacy!)

### Phase 2: Update Media Service
- [ ] Replace local file operations with Cloudinary uploads
- [ ] Update profile picture upload - store `public_id` only
- [ ] Update profile picture get - fetch from Cloudinary, return base64
- [ ] Update gallery photos upload/get/delete
- [ ] Update profile video upload/get/delete
- [ ] Keep sharp for pre-upload compression (reduces bandwidth costs)

### Phase 3: Update User Schema
- [ ] Change `profilePicture: string` to `profilePicturePublicId: string`
- [ ] Update gallery photo schema: store `publicId` instead of `filename`/`diskFilename`
- [ ] Change `profileVideo: string` to `profileVideoPublicId: string`

### Phase 4: Cleanup
- [ ] Remove local file system operations (join, existsSync, unlinkSync, etc.)
- [ ] Remove unused constants
- [ ] Update any admin endpoints that access media

---

## API Changes Summary

### ✅ NO CHANGES TO RESPONSE FORMAT

The key benefit of the backend-proxy approach is that **API responses stay the same**:

### Profile Picture

| Endpoint | Current Response | New Response |
|----------|------------------|--------------|
| `GET /media/profile-picture` | `{ media: "base64..." }` | `{ media: "base64..." }` ✅ Same |
| `POST /media/profile-picture` | `{ message, filename, ... }` | `{ message, publicId, ... }` (minor change) |
| `DELETE /media/profile-picture` | `{ message: "..." }` | `{ message: "..." }` ✅ Same |

### Gallery Photos

| Endpoint | Current Response | New Response |
|----------|------------------|--------------|
| `GET /media/gallery` | `{ photos: [{ id, media }] }` | `{ photos: [{ id, media }] }` ✅ Same |
| `GET /media/gallery/:photoId` | `{ id, media }` | `{ id, media }` ✅ Same |
| `POST /media/gallery` | `{ photos: [{ id, filename }] }` | `{ photos: [{ id, publicId }] }` (minor) |
| `DELETE /media/gallery/:photoId` | `{ message, ... }` | `{ message, ... }` ✅ Same |

### Profile Video

| Endpoint | Current Response | New Response |
|----------|------------------|--------------|
| `GET /media/video` | Streams file | `{ media: "base64..." }` (changed to base64) |
| `POST /media/video` | `{ filename, ... }` | `{ publicId, ... }` (minor change) |
| `DELETE /media/video` | `{ message: "..." }` | `{ message: "..." }` ✅ Same |

### Frontend Impact

**Minimal to none!** The `media` field still contains base64 strings:

```typescript
// This still works exactly the same
<img src={`data:image/webp;base64,${response.media}`} />
```

---

## Environment Variables

### Complete `.env` additions:

```env
# Cloudinary Configuration (Required)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Example with your existing .env:

```env
# ... your existing variables ...

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=dab123xyz
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcDEF123-ghiJKL456_mnoPQR
```

---

## Testing Checklist

After implementation, test the following:

### Local Environment
- [ ] Upload profile picture → verify returns `publicId`
- [ ] Get profile picture → verify returns base64 (same as before)
- [ ] Delete profile picture → verify removed from Cloudinary
- [ ] Upload gallery photos (1-3 images) → verify `publicId` for each
- [ ] Get all gallery photos → verify base64 array (same format as before)
- [ ] Get single gallery photo → verify base64 (same format)
- [ ] Delete gallery photo → verify removed from Cloudinary
- [ ] Upload profile video → verify returns `publicId`
- [ ] Get profile video → verify returns base64
- [ ] Delete profile video → verify removed from Cloudinary

### Cross-Environment Test (The Original Problem)
- [ ] Upload media from **local** environment
- [ ] Fetch same media from **production** environment → **Should work!**
- [ ] Upload media from **production** environment
- [ ] Fetch same media from **local** environment → **Should work!**

### Security Verification
- [ ] Check Cloudinary dashboard - files should show as `authenticated` type
- [ ] Try accessing a Cloudinary URL directly in browser → Should fail or require auth
- [ ] Verify no Cloudinary URLs appear in API responses to client

### Admin Module
- [ ] Verify admin can view pending media for approval
- [ ] Verify approve/reject still works correctly

---

## Rollback Plan

If issues occur, rollback steps:

1. **Revert code** to previous commit (before Cloudinary changes)
2. **Keep Cloudinary credentials** in `.env` (won't affect rolled-back code)
3. **Existing local files** will still work (we won't delete them during migration)

### Data Migration Note

- Existing users with local files will need their media re-uploaded
- OR we can create a migration script to upload existing files to Cloudinary
- Recommend: Inform users to re-upload profile pictures after migration

---

## Timeline

| Step | Owner | Status |
|------|-------|--------|
| Create Cloudinary account | You | ⏳ Pending |
| Get credentials | You | ⏳ Pending |
| Enable Strict Transformations | You | ⏳ Pending |
| Update local .env | You | ⏳ Pending |
| Phase 1: Setup (SDK + Service) | Claude | ⏳ Pending |
| Phase 2: Update Media Service | Claude | ⏳ Pending |
| Phase 3: Update User Schema | Claude | ⏳ Pending |
| Phase 4: Cleanup | Claude | ⏳ Pending |
| Local Testing | You | ⏳ Pending |
| Cross-Environment Testing | You | ⏳ Pending |
| Update production .env | You | ⏳ Pending |
| Deploy to production | You | ⏳ Pending |
| Production Testing | You | ⏳ Pending |

---

## Summary: Why This Approach is Best for Your App

| Concern | Solution |
|---------|----------|
| **Privacy** | Cloudinary URLs never reach the client |
| **Security** | Authenticated uploads + backend proxy |
| **Consistency** | Same cloud storage for local & production |
| **Frontend changes** | None required - same base64 format |
| **Cost** | Free tier (10GB storage, 20GB bandwidth) |
| **Complexity** | Moderate - we handle it in the backend |

---

## Questions?

Let me know when you've completed Steps 1-4, and I'll begin the code implementation phase by phase!
