// Called by GitHub Actions after a PR deploys to the sandbox. Posts (or refreshes) the approval card.
import { gh, findMarker, markerBody } from '../lib/github.js';
import { slack, bearerOk, approvers, approverMentions } from '../lib/slack.js';
import { buildCard } from '../lib/card.js';
import { entityFor } from '../lib/entity.js';

export async function POST(request) {
  if (!bearerOk(request)) return new Response('unauthorized', { status: 401 });
  const { pr: number, screenshots } = await request.json();

  const { pr, blocks, text } = await buildCard(number, { status: 'pending', screenshots });
  if (pr.state !== 'open') return Response.json({ skipped: 'PR not open' });

  // Slack only reads Work Object metadata when it arrives as a JSON string.
  const metadata = JSON.stringify({ entities: [entityFor(pr)] });
  const marker = await findMarker(number);
  if (marker) {
    await slack('chat.update', { channel: marker.channel, ts: marker.ts, text, blocks, metadata });
    await slack('chat.postMessage', {
      channel: marker.channel, thread_ts: marker.ts,
      text: `🔄 New commits (\`${pr.head.sha.slice(0, 7)}\`) are in the sandbox — the card above now reflects the latest version.`,
    });
    return Response.json({ ok: true, updated: true });
  }

  const channel = process.env.REVIEW_CHANNEL || (await slack('conversations.open', { users: approvers().join(',') })).channel.id;
  const posted = await slack('chat.postMessage', {
    channel, text, metadata, unfurl_links: false, unfurl_media: false, blocks: process.env.REVIEW_CHANNEL
      ? [{ type: 'section', text: { type: 'mrkdwn', text: `${approverMentions()} a change is ready for your review.` } }, ...blocks]
      : blocks,
  });
  await gh(`/issues/${number}/comments`, {
    method: 'POST',
    body: { body: markerBody('🔔 Sent to the approvers in Slack. This PR merges only from there.', { channel, ts: posted.ts }) },
  });
  return Response.json({ ok: true, channel, ts: posted.ts });
}
