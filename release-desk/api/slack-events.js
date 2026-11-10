// Slack Events API endpoint. Answers the URL challenge; entity_details_requested handling comes next.
import { verifySlack } from '../lib/slack.js';

export async function POST(request) {
  const raw = await request.text();
  if (!verifySlack(request, raw)) return new Response('bad signature', { status: 401 });
  const body = JSON.parse(raw);
  if (body.type === 'url_verification') {
    return new Response(body.challenge, { headers: { 'Content-Type': 'text/plain' } });
  }
  if (body.type === 'event_callback') {
    console.log('slack event', body.event?.type, 'from', body.event?.user);
  }
  return new Response('');
}
