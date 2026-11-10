// Slack Events API: URL challenge + entity_details_requested (someone opened a Release Desk Work Object).
import { verifySlack, slack } from '../lib/slack.js';
import { gh } from '../lib/github.js';
import { entityFor } from '../lib/entity.js';
import { sign, baseUrl } from '../lib/review.js';

export async function POST(request) {
  const raw = await request.text();
  if (!verifySlack(request, raw)) return new Response('bad signature', { status: 401 });
  const body = JSON.parse(raw);
  if (body.type === 'url_verification') return new Response(body.challenge, { headers: { 'Content-Type': 'text/plain' } });
  if (body.type !== 'event_callback' || body.event?.type !== 'entity_details_requested') return new Response('');

  const ev = body.event;
  const m = /^pr-(\d+)$/.exec(ev.external_ref?.id || '');
  if (!m) return new Response('');
  try {
    const pr = await gh(`/pulls/${m[1]}`);
    const token = sign({ pr: pr.number, sha: pr.head.sha, user: ev.user, channel: ev.channel, ts: ev.message_ts });
    const metadata = entityFor(pr, `${baseUrl()}/api/review?t=${token}`);
    metadata.url = ev.entity_url || metadata.url;
    await slack('entity.presentDetails', { trigger_id: ev.trigger_id, metadata });
  } catch (e) {
    console.error('entity_details_requested failed:', e.message);
    await slack('entity.presentDetails', { trigger_id: ev.trigger_id, error: { status: 'internal_error' } }).catch(() => {});
  }
  return new Response('');
}
