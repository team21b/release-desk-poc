// Short-lived signed tokens that bind a review page to one PR, one commit and one Slack user.
import crypto from 'node:crypto';

const key = () => crypto.createHash('sha256').update('release-desk-review:' + (process.env.SLACK_SIGNING_SECRET || '')).digest();

export function sign(data, ttlSec = 600) {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', key()).update(body).digest('base64url')}`;
}

export function verify(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', key()).update(body).digest('base64url');
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac))) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString());
  return data.exp > Date.now() / 1000 ? data : null;
}

export const baseUrl = () => process.env.PUBLIC_URL || 'https://release-desk-poc.vercel.app';
