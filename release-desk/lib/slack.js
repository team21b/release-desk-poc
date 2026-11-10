import crypto from 'node:crypto';

export async function slack(method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error} ${(data.response_metadata?.messages || []).join('; ')}`.trim());
  return data;
}

// https://api.slack.com/authentication/verifying-requests-from-slack
export function verifySlack(request, raw) {
  const ts = request.headers.get('x-slack-request-timestamp');
  const sig = request.headers.get('x-slack-signature') || '';
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const mine = 'v0=' + crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET || '').update(`v0:${ts}:${raw}`).digest('hex');
  return mine.length === sig.length && crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(sig));
}

export async function respond(responseUrl, body) {
  await fetch(responseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export function bearerOk(request) {
  const want = process.env.NOTIFY_TOKEN;
  const got = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  return !!want && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
