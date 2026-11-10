// The access workflow reports here after granting / revoking, so the Slack card reflects what really happened.
import { slack, bearerOk } from '../lib/slack.js';
import { accessCard } from '../lib/access.js';

export async function POST(request) {
  if (!bearerOk(request)) return new Response('unauthorized', { status: 401 });
  const p = await request.json();
  if (!p.channel || !p.ts) return Response.json({ skipped: 'no card' });
  const r = { id: p.id, requester: p.requester, sfUser: p.sfUser, bundle: p.bundle, label: p.label, grants: p.grants, minutes: p.minutes };
  const state = p.result === 'granted' ? { status: 'granted', by: p.approvedBy, expires: p.expires, runUrl: p.run_url }
    : p.result === 'revoked' ? { status: 'revoked', by: p.revokedBy, runUrl: p.run_url }
    : { status: 'failed', by: p.approvedBy, error: p.error, runUrl: p.run_url };
  const { blocks, text } = accessCard(r, state);
  await slack('chat.update', { channel: p.channel, ts: p.ts, text, blocks });
  const t = p.expires ? Math.floor(Date.parse(p.expires) / 1000) : 0;
  await slack('chat.postMessage', {
    channel: p.channel, thread_ts: p.ts,
    text: p.result === 'granted' ? `🔓 Granted. <@${r.requester}> has *${r.label}* until <!date^${t}^{time}|${p.expires}>. Salesforce removes it automatically.`
      : p.result === 'revoked' ? `🔒 Removed. <@${r.requester}> no longer has *${r.label}*.`
      : `❌ Couldn't apply this: ${p.error}`,
  });
  return Response.json({ ok: true });
}
