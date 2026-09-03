import axios from 'axios';
import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
// Apple's JWKS client for public key verification
const appleJwksClient = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

export async function googleSignIn(
  code: string,
  redirectUri?: string,
): Promise<any> {
  const tokenReq = await axios.request({
    url: 'https://oauth2.googleapis.com/token',
    method: 'POST',
    data: new URLSearchParams(
      Object.entries({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri ?? process.env.REDIRECT_URI,
        grant_type: 'authorization_code',
        scope: 'profile email',
        code: decodeURIComponent(code),
      }),
    ).toString(),
  });

  const accessToken = tokenReq.data.access_token;
  const idToken = tokenReq.data.id_token;

  return googleVerify(accessToken, idToken);
}

export async function googleVerify(
  _accessToken: string,
  idToken: string,
): Promise<any> {
  const userProfile: any = jwt.decode(idToken);
  if (!userProfile) {
    throw new UnauthorizedException('mmij-08');
  }

  // Only trust the email if Google asserts it is verified. Without this check,
  // a Google account claiming an unverified email could merge into an existing
  // local account with that email (account takeover vector).
  if (userProfile.email && userProfile.email_verified !== true) {
    throw new UnauthorizedException('mmij-35');
  }

  const externalId = userProfile.sub;
  const firstName =
    userProfile.given_name ?? userProfile.name?.split(' ')[0] ?? '';
  const lastName =
    userProfile.family_name ??
    userProfile.name?.split(' ').slice(1).join(' ') ??
    '';
  const email = userProfile.email?.toLowerCase();

  return {
    firstName,
    lastName,
    email,
    externalId,
  } as any;
}

/**
 * Generates Apple client secret (JWT signed with your private key)
 * Apple requires a dynamically generated client secret unlike Google's static secret
 */
function generateAppleClientSecret(clientId: string): string {
  const privateKey = process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n');

  const token = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '180d',
    audience: 'https://appleid.apple.com',
    issuer: process.env.APPLE_TEAM_ID,
    subject: clientId,
    keyid: process.env.APPLE_KEY_ID,
  });

  return token;
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
  // Web flows pass a redirectUri; mobile (Flutter) does not.
  // Web uses a Services ID; mobile uses the iOS Bundle ID.
  const clientId = redirectUri
    ? process.env.APPLE_WEB_CLIENT_ID || process.env.APPLE_BUNDLE_ID
    : process.env.APPLE_BUNDLE_ID;

  const clientSecret = generateAppleClientSecret(clientId);

  const tokenRequestBody: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    code: decodeURIComponent(code),
    grant_type: 'authorization_code',
  };
  if (redirectUri) {
    tokenRequestBody.redirect_uri = redirectUri;
  }

  let tokenReq;
  try {
    tokenReq = await axios.request({
      url: 'https://appleid.apple.com/auth/token',
      method: 'POST',
      data: new URLSearchParams(Object.entries(tokenRequestBody)).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  } catch (error) {
    throw error;
  }

  const idToken = tokenReq.data.id_token;
  const decodedHeader = jwt.decode(idToken, { complete: true }).header;
  const signingKey = await getAppleSigningKey(decodedHeader.kid);

  jwt.verify(idToken, signingKey, {
    algorithms: ['RS256'],
    issuer: 'https://appleid.apple.com',
    audience: clientId,
  });

  const userProfile: any = jwt.decode(idToken);
  userProfile.firstName = userInfo?.firstName;
  userProfile.lastName = userInfo?.lastName;

  return userProfile;
}

/**
 * Verify Apple ID token and extract user profile
 * @param idToken - Apple's ID token (JWT)
 * @param userInfo - User's name from first sign-in (optional)
 */
export async function appleVerify(
  code: string,
  redirectUri?: string,
  userInfo?: { firstName?: string; lastName?: string },
): Promise<any> {
  const userProfile: any = await appleSignIn(code, redirectUri, userInfo);
  const externalId = userProfile.sub;
  const firstName = userProfile.firstName;
  const lastName = userProfile.lastName;
  const email = userProfile.email?.toLowerCase();

  return {
    firstName,
    lastName,
    email,
    externalId,
  } as any;
}
