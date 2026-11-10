// Slash commands. /elevate opens the time-boxed access request form.
import { verifySlack, slack } from '../lib/slack.js';
import { loadBundles, requestModal, sfUserFor } from '../lib/access.js';

export async function POST(request) {
  const raw = await request.text();
  if (!verifySlack(request, raw)) return new Response('bad signature', { status: 401 });
  const f = new URLSearchParams(raw);
  if (f.get('command') !== '/elevate') return new Response('');
  if (!sfUserFor(f.get('user_id')))
    return Response.json({ response_type: 'ephemeral', text: "You don't have a production Salesforce user linked to Release Desk yet, so there's nothing to elevate. Ask an approver to add you." });
  const bundles = await loadBundles();
  if (!bundles.length) return Response.json({ response_type: 'ephemeral', text: 'No access bundles are configured yet.' });
  await slack('views.open', { trigger_id: f.get('trigger_id'), view: requestModal(bundles) });
  return new Response('');
}
