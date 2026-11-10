// Called by GitHub Actions after the production deploy. Posts the outcome back into the card's thread.
import { gh, findMarker } from '../lib/github.js';
import { slack, bearerOk } from '../lib/slack.js';
import { buildCard } from '../lib/card.js';

export async function POST(request) {
  if (!bearerOk(request)) return new Response('unauthorized', { status: 401 });
  const { sha, result, run_url: runUrl } = await request.json();

  const pulls = await gh(`/commits/${sha}/pulls`);
  const pr = pulls.find((p) => p.merged_at) || pulls[0];
  if (!pr) return Response.json({ skipped: 'no PR for commit' });
  const marker = await findMarker(pr.number);
  if (!marker) return Response.json({ skipped: 'PR never went through Release Desk' });

  const ok = result === 'success';
  const { blocks, text } = await buildCard(pr.number, { status: ok ? 'live' : 'failed', runUrl });
  await slack('chat.update', { channel: marker.channel, ts: marker.ts, text, blocks });
  await slack('chat.postMessage', {
    channel: marker.channel, thread_ts: marker.ts,
    text: ok
      ? `🚀 Live in production. <${runUrl}|Deploy log>`
      : `❌ The production deploy failed (${result}). Salesforce deploys are all-or-nothing, so production is unchanged. <${runUrl}|Deploy log>`,
  });
  return Response.json({ ok: true });
}
