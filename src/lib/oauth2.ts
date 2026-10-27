/**
 * Microsoft OAuth2 (XOAUTH2) Modern Authentication Engine
 *
 * Implements the Device Authorization Grant flow for browser sign-in
 * and automatic Refresh Token -> Access Token exchange for IMAP & SMTP.
 */

export const MS_CLIENT_ID =
  process.env.MICROSOFT_CLIENT_ID || '9e5f94bc-e8a4-4e73-b8be-63364c29d753';

export const MS_SCOPES =
  'https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access openid email';

export const OAUTH_CREDENTIAL_PREFIX = 'oauth2_ms:';

// In-memory token cache: email (lowercase) -> { accessToken, expiresAt }
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}
const tokenCache = new Map<string, CachedToken>();

/**
 * Checks if the stored password string is a Microsoft OAuth2 credential.
 */
export function isOAuthCredential(password?: string | null): boolean {
  return Boolean(password && password.startsWith(OAUTH_CREDENTIAL_PREFIX));
}

/**
 * Extracts the raw refresh token from an OAuth credential string.
 */
export function extractRefreshToken(password: string): string {
  if (password.startsWith(OAUTH_CREDENTIAL_PREFIX)) {
    return password.slice(OAUTH_CREDENTIAL_PREFIX.length).trim();
  }
  return password.trim();
}

/**
 * Formats a raw refresh token into the stored credential string.
 */
export function formatOAuthCredential(refreshToken: string): string {
  return `${OAUTH_CREDENTIAL_PREFIX}${refreshToken.trim()}`;
}

export interface MailAuthResult {
  user: string;
  pass?: string;
  accessToken?: string;
  updatedCredential?: string;
}

/**
 * Resolves authentication credentials for IMAP and SMTP connections.
 * If password is an OAuth2 credential, exchanges the refresh token for a live access token (using cache if fresh).
 * If password is standard cleartext or app password, returns it unchanged.
 */
export async function resolveMailAuth(
  email: string,
  password?: string | null
): Promise<MailAuthResult> {
  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!password || !isOAuthCredential(password)) {
    return {
      user: email,
      pass: password || '',
    };
  }

  // Check cache (require at least 120 seconds of remaining validity)
  const cached = tokenCache.get(normalizedEmail);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 120_000) {
    return {
      user: email,
      accessToken: cached.accessToken,
    };
  }

  // Refresh token exchange
  const refreshToken = extractRefreshToken(password);
  const tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

  const bodyParams = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: MS_SCOPES,
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.access_token) {
    const errorMsg =
      data.error_description || data.error || `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(`Microsoft OAuth2 token refresh failed: ${errorMsg}`);
  }

  const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  tokenCache.set(normalizedEmail, {
    accessToken: data.access_token,
    expiresAt: now + expiresInSec * 1000,
  });

  return {
    user: email,
    accessToken: data.access_token,
    updatedCredential: data.refresh_token ? formatOAuthCredential(data.refresh_token) : undefined,
  };
}

export interface DeviceFlowStartResult {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

/**
 * Initiates the Microsoft OAuth2 Device Code browser flow.
 */
export async function startMicrosoftDeviceFlow(): Promise<DeviceFlowStartResult> {
  const deviceEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/devicecode';

  const bodyParams = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    scope: MS_SCOPES,
  });

  const res = await fetch(deviceEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.device_code) {
    const errorMsg =
      data.error_description || data.error || `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(`Failed to start Microsoft device flow: ${errorMsg}`);
  }

  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri || 'https://microsoft.com/devicelogin',
    expires_in: data.expires_in || 900,
    interval: data.interval || 5,
    message: data.message || `Enter code ${data.user_code} at ${data.verification_uri}`,
  };
}

export interface DeviceFlowPollResult {
  status: 'pending' | 'authorized' | 'expired' | 'error';
  credential?: string;
  email?: string;
  error?: string;
}

/**
 * Polls the Microsoft OAuth2 token endpoint to check if the user has completed browser verification.
 */
export async function pollMicrosoftDeviceToken(deviceCode: string): Promise<DeviceFlowPollResult> {
  const tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

  const bodyParams = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    client_id: MS_CLIENT_ID,
    device_code: deviceCode,
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  });

  const data = await res.json().catch(() => ({}));

  if (data.error === 'authorization_pending' || data.error === 'slow_down') {
    return { status: 'pending' };
  }

  if (data.error === 'expired_token') {
    return {
      status: 'expired',
      error: 'The Microsoft sign-in session expired. Please restart sign-in.',
    };
  }

  if (!res.ok || data.error) {
    return {
      status: 'error',
      error: data.error_description || data.error || `HTTP ${res.status}: ${res.statusText}`,
    };
  }

  if (data.access_token && data.refresh_token) {
    let extractedEmail: string | undefined;

    // Decode id_token JWT payload if available to obtain user email
    if (data.id_token) {
      try {
        const parts = data.id_token.split('.');
        if (parts.length >= 2) {
          const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
          const payload = JSON.parse(payloadJson);
          extractedEmail = payload.email || payload.preferred_username || payload.upn;
        }
      } catch {
        // Fallback if parsing fails
      }
    }

    if (extractedEmail) {
      const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
      tokenCache.set(extractedEmail.toLowerCase(), {
        accessToken: data.access_token,
        expiresAt: Date.now() + expiresInSec * 1000,
      });
    }

    return {
      status: 'authorized',
      credential: formatOAuthCredential(data.refresh_token),
      email: extractedEmail,
    };
  }

  return {
    status: 'error',
    error: 'Unexpected response from Microsoft authentication endpoint.',
  };
}
