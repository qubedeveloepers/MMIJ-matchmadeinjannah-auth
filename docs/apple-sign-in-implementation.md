# Apple Sign-In Implementation Guide

This document outlines the implementation of Apple Sign-In for the MatchMadeInJannah authentication backend.

## Table of Contents

- [Overview](#overview)
- [Current State](#current-state)
- [Key Differences: Google vs Apple](#key-differences-google-vs-apple)
- [App Store Connect Setup](#app-store-connect-setup)
- [Backend Implementation](#backend-implementation)
- [Environment Configuration](#environment-configuration)
- [Frontend Requirements](#frontend-requirements)
- [Critical Considerations](#critical-considerations)
- [Testing Checklist](#testing-checklist)

---

## Overview

Apple Sign-In allows users to authenticate using their Apple ID. The implementation follows a similar pattern to the existing Google Sign-In but with several key differences, most notably that **Apple only provides the user's name on their first sign-in**.

---

## Current State

The codebase is already prepared for Apple Sign-In:

| Component | Status | Location |
|-----------|--------|----------|
| `AuthType.APPLE` enum | Ready | `src/users/enums/authType.enum.ts` |
| User `accounts` array | Ready | `src/users/user.schema.ts` |
| Generic social endpoint | Ready | `POST /auth/socialSignIn/apple` |
| Apple OAuth utility | **Needs Implementation** | `src/auth/utils/oauth-utils.ts` |

---

## Key Differences: Google vs Apple

| Aspect | Google | Apple |
|--------|--------|-------|
| Name availability | Always returned in token | **Only on first sign-in** |
| ID Token issuer | `accounts.google.com` | `https://appleid.apple.com` |
| Token verification | Simple JWT decode | Must verify signature with Apple's public keys (JWKS) |
| Client secret | Static string from Google Console | **Dynamically generated JWT** signed with private key |
| Profile picture | Provided via URL | Not provided |
| Email privacy | Always real email | User can choose to hide (relay email) |

---

## App Store Connect Setup

### Step 1: Enable Sign in with Apple Capability

1. Navigate to [Apple Developer Portal](https://developer.apple.com/account)
2. Go to **Certificates, Identifiers & Profiles** → **Identifiers**
3. Select your App ID (or create one)
4. Scroll to **Sign in with Apple** capability
5. Enable it and configure as **Primary App ID**
6. Save changes

### Step 2: Create a Services ID

This is required for web/backend OAuth flow.

1. Go to **Identifiers** → Click **+** button
2. Select **Services IDs** → Continue
3. Fill in:
   - **Description**: `MatchMadeInJannah Auth Service`
   - **Identifier**: `com.matchmadeinjannah.auth` (this becomes your `APPLE_CLIENT_ID`)
4. Enable **Sign in with Apple**
5. Click **Configure** and set:
   - **Domains**: Your API domain (e.g., `api.matchmadeinjannah.com`)
   - **Return URLs**: `https://api.matchmadeinjannah.com/auth/apple/callback`
6. Save and register

### Step 3: Create a Private Key

1. Go to **Keys** → Click **+** button
2. Enter key name: `Sign in with Apple Key`
3. Enable **Sign in with Apple**
4. Click **Configure** → Select your primary App ID
5. Continue and **Register**
6. **Download the `.p8` file immediately**
   > **Warning**: You can only download this file once. Store it securely!
7. Note the **Key ID** (10 characters) → This is your `APPLE_KEY_ID`

### Step 4: Locate Your Team ID

1. Go to **Membership** in the Apple Developer Portal
2. Find your **Team ID** (10 characters)
3. This is your `APPLE_TEAM_ID`

### Summary of Required Values

| Value | Where to Find | Example |
|-------|---------------|---------|
| `APPLE_CLIENT_ID` | Services ID Identifier | `com.matchmadeinjannah.auth` |
| `APPLE_TEAM_ID` | Membership page | `ABCD123456` |
| `APPLE_KEY_ID` | Keys page after creation | `XYZ9876543` |
| `APPLE_PRIVATE_KEY` | Downloaded `.p8` file contents | `-----BEGIN PRIVATE KEY-----\n...` |

---

## Backend Implementation

### 1. Install Required Dependency

```bash
npm install jwks-rsa
```

### 2. Add Apple OAuth Utility

Add the following to `src/auth/utils/oauth-utils.ts`:

```typescript
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Apple's JWKS client for public key verification
const appleJwksClient = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

/**
 * Generates Apple client secret (JWT signed with your private key)
 * Apple requires a dynamically generated client secret unlike Google's static secret
 */
function generateAppleClientSecret(): string {
  const privateKey = process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n');

  const token = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '180d',
    audience: 'https://appleid.apple.com',
    issuer: process.env.APPLE_TEAM_ID,
    subject: process.env.APPLE_CLIENT_ID,
    keyid: process.env.APPLE_KEY_ID,
  });

  return token;
}

/**
 * Exchange Apple authorization code for tokens and verify
 * @param code - Authorization code from Apple
 * @param redirectUri - OAuth callback URI
 * @param userInfo - User's name (only available on first sign-in)
 */
export async function appleSignIn(
  code: string,
  redirectUri?: string,
  userInfo?: { firstName?: string; lastName?: string },
): Promise<any> {
  const clientSecret = generateAppleClientSecret();

  const tokenReq = await axios.request({
    url: 'https://appleid.apple.com/auth/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: new URLSearchParams({
      client_id: process.env.APPLE_CLIENT_ID,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri ?? process.env.APPLE_REDIRECT_URI,
    }).toString(),
  });

  const idToken = tokenReq.data.id_token;

  return appleVerify(idToken, userInfo);
}

/**
 * Get Apple's public signing key for JWT verification
 */
async function getAppleSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    appleJwksClient.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
      } else {
        resolve(key.getPublicKey());
      }
    });
  });
}

/**
 * Verify Apple ID token and extract user profile
 * @param idToken - Apple's ID token (JWT)
 * @param userInfo - User's name from first sign-in (optional)
 */
export async function appleVerify(
  idToken: string,
  userInfo?: { firstName?: string; lastName?: string },
): Promise<any> {
  // Decode header to get key ID (kid)
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || !decoded.header.kid) {
    throw new Error('Invalid Apple ID token');
  }

  // Get Apple's public key and verify signature
  const publicKey = await getAppleSigningKey(decoded.header.kid);

  const payload = jwt.verify(idToken, publicKey, {
    algorithms: ['RS256'],
    issuer: 'https://appleid.apple.com',
    audience: process.env.APPLE_CLIENT_ID,
  }) as any;

  // Extract user information
  const externalId = payload.sub; // Apple's unique user ID (stable across logins)
  const email = payload.email?.toLowerCase();

  // CRITICAL: Apple only sends name on FIRST sign-in
  // The frontend must capture and send this in userInfo
  const firstName = userInfo?.firstName || '';
  const lastName = userInfo?.lastName || '';

  return {
    firstName,
    lastName,
    email,
    profilePicture: null, // Apple doesn't provide profile pictures
    externalId,
  };
}
```

### 3. Update Auth Service

Modify `src/auth/auth.service.ts`:

```typescript
// Add import
import { appleSignIn } from './utils/oauth-utils';

// Update socialSignIn method signature and implementation
async socialSignIn(
  token: string,
  authType: AuthType,
  redirectUri?: string,
  userInfo?: { firstName?: string; lastName?: string },
): Promise<Partial<any>> {
  let profile: any;
  switch (authType) {
    case AuthType.GOOGLE:
      profile = await googleSignIn(token, redirectUri);
      break;

    case AuthType.APPLE:
      profile = await appleSignIn(token, redirectUri, userInfo);
      break;

    default:
      throw new BadRequestException('auth-19');
  }

  return this.createSocialUser(authType, profile);
}
```

### 4. Update Credentials DTO

Modify `src/auth/dto/credentials.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';

// Add new DTO for Apple user info
export class AppleUserInfoDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;
}

// Add to CredentialsDto class
export class CredentialsDto {
  // ... existing fields ...

  @IsOptional()
  @ValidateNested()
  @Type(() => AppleUserInfoDto)
  readonly userInfo?: AppleUserInfoDto;
}
```

### 5. Update Auth Controller

Modify `src/auth/auth.controller.ts`:

```typescript
@Post('socialSignIn/:authType')
@HttpCode(200)
@Public()
@UsePipes(new CredentialsValidationPipe('socialSignIn'))
async socialSignIn(
  @Param('authType') authType: string,
  @Body() credentials: CredentialsDto,
  @Res({ passthrough: true }) res: Response,
): Promise<Partial<any>> {
  const user = await this.authService.socialSignIn(
    credentials.code,
    authType.toUpperCase() as AuthType,
    credentials.redirectUri,
    credentials.userInfo, // Pass Apple user info
  );

  const token = await this.authService.generateToken(
    user._id,
    user.username,
    user.email,
    user.firstName,
    user.lastName,
    user.role,
  );

  res.header('Authorization', `Bearer ${token}`);
  return user;
}
```

---

## Environment Configuration

Add the following to your `.env` file:

```env
# Apple Sign-In Configuration
APPLE_CLIENT_ID=com.matchmadeinjannah.auth
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_KEY_ID=XXXXXXXXXX
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGTAgEA...\n-----END PRIVATE KEY-----"
APPLE_REDIRECT_URI=https://api.matchmadeinjannah.com/auth/apple/callback
```

> **Note**: For the private key, replace newlines with `\n` to store as a single-line string, or use a secrets manager that supports multiline values.

---

## Frontend Requirements

### iOS (Swift) Implementation

The mobile app must capture and forward the user's name on first sign-in:

```swift
func authorizationController(controller: ASAuthorizationController,
                            didCompleteWithAuthorization authorization: ASAuthorization) {
    if let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential {
        let code = String(data: appleIDCredential.authorizationCode!, encoding: .utf8)!

        // CRITICAL: fullName is only available on FIRST sign-in
        var userInfo: [String: String]? = nil
        if let fullName = appleIDCredential.fullName {
            userInfo = [
                "firstName": fullName.givenName ?? "",
                "lastName": fullName.familyName ?? ""
            ]
        }

        // Send to backend
        let requestBody: [String: Any] = [
            "code": code,
            "redirectUri": "your-redirect-uri",
            "userInfo": userInfo as Any
        ]

        // POST to /auth/socialSignIn/apple
    }
}
```

### Request Format

```json
{
  "code": "authorization_code_from_apple",
  "redirectUri": "https://api.matchmadeinjannah.com/auth/apple/callback",
  "userInfo": {
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

> **Important**: `userInfo` will only contain values on the user's first sign-in. On subsequent logins, omit it or send `null`.

---

## Critical Considerations

### 1. Name Only Available Once

Apple provides the user's name **only on the first authorization**. This means:

- The frontend **must** capture `fullName` from `ASAuthorizationAppleIDCredential`
- The frontend **must** send this to the backend immediately
- If missed, the user's name will be empty in your database
- Users would need to manually enter their name during onboarding

### 2. Hidden Email Addresses

Users can choose to hide their real email. Apple provides a relay address like:

```
dpdcnf87hg@privaterelay.appleid.com
```

This relay forwards emails to the user's real address. Your app should:
- Accept these relay emails as valid
- Send emails normally (Apple handles forwarding)

### 3. Token Revocation

Users can revoke access via Settings → Apple ID → Password & Security → Apps Using Apple ID. Implement a webhook to handle revocation events (optional but recommended).

### 4. Existing User Linking

The current `createSocialUser` implementation already handles linking Apple auth to existing email accounts. When a user signs in with Apple using an email that already exists:

1. The existing account is found by email
2. `AuthType.APPLE` is added to the `authType` array
3. Apple's `externalId` is stored in the `accounts` array

---

## Testing Checklist

### App Store Connect

- [ ] App ID has "Sign in with Apple" capability enabled
- [ ] Services ID is created and configured
- [ ] Domains and Return URLs are correctly set
- [ ] Private key (`.p8` file) is downloaded and stored securely
- [ ] Team ID, Key ID, and Client ID are documented

### Backend

- [ ] `jwks-rsa` package is installed
- [ ] `appleSignIn` and `appleVerify` functions are implemented
- [ ] Auth service handles `AuthType.APPLE` case
- [ ] DTO includes `userInfo` field
- [ ] Controller passes `userInfo` to service
- [ ] Environment variables are configured

### Integration Testing

- [ ] First-time sign-in captures name correctly
- [ ] Subsequent sign-ins work without name
- [ ] Existing users can link Apple account
- [ ] Hidden email addresses are accepted
- [ ] JWT token is generated and returned correctly
- [ ] Error handling for invalid tokens works

### Frontend

- [ ] Authorization code is captured correctly
- [ ] User's name is extracted from `fullName` on first sign-in
- [ ] Request includes `userInfo` when available
- [ ] Deep links / Universal Links are configured for callbacks

---

## API Reference

### Endpoint

```
POST /auth/socialSignIn/apple
```

### Request Headers

```
Content-Type: application/json
```

### Request Body

```json
{
  "code": "string (required) - Authorization code from Apple",
  "redirectUri": "string (optional) - OAuth callback URI",
  "userInfo": {
    "firstName": "string (optional) - User's first name (first sign-in only)",
    "lastName": "string (optional) - User's last name (first sign-in only)"
  }
}
```

### Response

```json
{
  "_id": "user_id",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "username": "johndoe1234",
  "status": "ACTIVE",
  "authType": ["APPLE"],
  "isOnboarded": false
}
```

### Response Headers

```
Authorization: Bearer <jwt_token>
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `auth-19` | Invalid auth type (not GOOGLE, APPLE, etc.) |
| `auth-21` | Error creating social user |
| `auth-32` | Missing authorization code |
| `mmij-35` | Email not provided by Apple |

---

## References

- [Apple Sign In Documentation](https://developer.apple.com/sign-in-with-apple/)
- [Apple REST API](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api)
- [Generate and Validate Tokens](https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens)
- [JWKS Client (jwks-rsa)](https://github.com/auth0/node-jwks-rsa)
