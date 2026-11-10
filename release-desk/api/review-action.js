// Buttons on the in-Slack review page post here. The signed token says which PR, commit and Slack user.
import { verify } from '../lib/review.js';
import { isApprover } from '../lib/slack.js';
import { act } from '../lib/actions.js';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const reply = (body, status = 200) => Response.json(body, { status, headers: cors });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function POST(request) {
  let input;
  try { input = JSON.parse(await request.text()); } catch { return reply({ ok: false, message: 'Bad request.' }, 400); }
  const data = verify(input.t);
  if (!data) return reply({ ok: false, message: 'This review link has expired. Close the panel and open it again.' }, 401);
  if (!isApprover(data.user)) return reply({ ok: false, message: 'You can view this change, but only approvers can act on it.' }, 403);
  if (!['approve', 'request_changes', 'reject'].includes(input.action)) return reply({ ok: false, message: 'Unknown action.' }, 400);
  const result = await act({ action: input.action, pr: data.pr, sha: data.sha, user: { id: data.user }, note: input.note, channel: data.channel, ts: data.ts, via: 'review page' });
  return reply(result, result.ok ? 200 : 409);
}
