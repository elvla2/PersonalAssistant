import crypto from 'node:crypto';

export function generateThreadId(userId: string, channel: string, externalId: string): string {
  return crypto
    .createHash('sha256')
    .update(`${userId}_${channel}_${externalId}`)
    .digest('hex');
}
