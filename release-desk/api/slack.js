// Slack interactivity endpoint: card buttons (Approve & ship / Request changes) and the change-request modal.
import { slack, verifySlack, respond, isApprover, approverMentions } from '../lib/slack.js';
import { act } from '../lib/actions.js';
import { loadBundles, sfUserFor, canApprove, dispatch, accessCard, duration } from '../lib/access.js';
import { approverMentions as mentions, isApprover as approverCheck } from '../lib/slack.js';
import crypto from 'node:crypto';

const say = (channel, ts, text) => slack('chat.postMessage', { channel, thread_ts: ts, text });

async function handleAccessAction(payload, action) {
  const r = JSON.parse(action.value);
  const user = payload.user.id;
  const channel = payload.container.channel_id;
  const ts = payload.container.message_ts;
  const nope = (text) => respond(payload.response_url, { response_type: 'ephemeral', replace_original: false, text });
  const update = (state) => { const { blocks, text } = accessCard(r, state); return slack('chat.update', { channel, ts, text, blocks }); };

  if (action.action_id === 'access_approve') {
    if (!canApprove(user, r.requester)) return nope(user === r.requester ? "You can't approve your own access request." : `Only ${mentions()} can approve access.`);
    try { await dispatch({ action: 'grant', ...r, approvedBy: user, channel, ts }); }
    catch (e) { await say(channel, ts, `❌ Couldn't start the grant: ${e.message}`); return; }
    await update({ status: 'approved', by: user });
    return say(channel, ts, `✅ Approved by <@${user}>. Granting now…`);
  }
  if (action.action_id === 'access_deny') {
    if (user === r.requester) { await update({ status: 'withdrawn' }); return say(channel, ts, `↩️ <@${user}> withdrew the request.`); }
    if (!approverCheck(user)) return nope(`Only ${mentions()} can deny access.`);
    await update({ status: 'denied', by: user });
    return say(channel, ts, `⛔ Denied by <@${user}>.`);
  }
  if (action.action_id === 'access_revoke') {
    if (!approverCheck(user) && user !== r.requester) return nope('Only the requester or an approver can remove this access.');
    try { await dispatch({ action: 'revoke', ...r, revokedBy: user, channel, ts }); }
    catch (e) { await say(channel, ts, `❌ Couldn't start the revoke: ${e.message}`); return; }
    await update({ status: 'revoking', by: user });
    return say(channel, ts, `🔒 <@${user}> is removing the access now…`);
  }
}

async function submitAccessRequest(payload) {
  const v = payload.view.state.values;
  const requester = payload.user.id;
  const sfUser = sfUserFor(requester);
  const bundles = await loadBundles();
  const b = bundles.find((x) => x.key === v.bundle.v.selected_option?.value);
  const minutes = Number(v.minutes.v.selected_option?.value);
  if (!sfUser) return Response.json({ response_action: 'errors', errors: { bundle: 'You have no production user linked to Release Desk.' } });
  if (!b) return Response.json({ response_action: 'errors', errors: { bundle: 'Pick an access bundle.' } });
  if (!b.durations.includes(minutes)) return Response.json({ response_action: 'errors', errors: { minutes: 'That duration is not allowed for this access.' } });
  const r = { id: crypto.randomBytes(4).toString('hex'), requester, sfUser, bundle: b.key, label: b.label, grants: b.grants, minutes };
  const { blocks, text } = accessCard(r);
  const channel = process.env.REVIEW_CHANNEL;
  const posted = await slack('chat.postMessage', { channel, text, unfurl_links: false, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `${mentions()} an access request needs a decision.` } }, ...blocks] });
  await say(channel, posted.ts, `*Reason from <@${requester}>:*\n>${(v.reason.v.value || '').replace(/\n/g, '\n>')}`);
  return new Response('');
}


const changesModal = (meta) => ({
  type: 'modal',
  callback_id: 'request_changes',
  private_metadata: JSON.stringify(meta),
  title: { type: 'plain_text', text: 'Request changes' },
  submit: { type: 'plain_text', text: 'Send back' },
  close: { type: 'plain_text', text: 'Cancel' },
  blocks: [{
    type: 'input', block_id: 'note',
    label: { type: 'plain_text', text: 'What needs to change?' },
    element: { type: 'plain_text_input', action_id: 'note', multiline: true },
  }],
});

export async function POST(request) {
  const raw = await request.text();
  if (!verifySlack(request, raw)) return new Response('bad signature', { status: 401 });
  const payload = JSON.parse(new URLSearchParams(raw).get('payload'));

  if (payload.type === 'block_actions' && payload.actions[0].action_id.startsWith('access_')) {
    await handleAccessAction(payload, payload.actions[0]);
    return new Response('');
  }
  if (payload.type === 'view_submission' && payload.view.callback_id === 'access_request') return submitAccessRequest(payload);

  if (payload.type === 'block_actions') {
    const action = payload.actions[0];
    if (!['approve', 'request_changes'].includes(action.action_id)) return new Response('');
    if (!isApprover(payload.user.id)) {
      await respond(payload.response_url, { response_type: 'ephemeral', replace_original: false, text: `Only ${approverMentions()} can approve or send back changes.` });
      return new Response('');
    }
    const { pr, sha } = JSON.parse(action.value);
    const channel = payload.container.channel_id;
    const ts = payload.container.message_ts;
    if (action.action_id === 'approve') await act({ action: 'approve', pr, sha, user: payload.user, channel, ts, via: 'card' });
    else await slack('views.open', { trigger_id: payload.trigger_id, view: changesModal({ pr, channel, ts }) });
    return new Response('');
  }

  if (payload.type === 'view_submission' && payload.view.callback_id === 'request_changes') {
    if (!isApprover(payload.user.id)) return new Response('');
    const { pr, channel, ts } = JSON.parse(payload.view.private_metadata);
    await act({ action: 'request_changes', pr, user: payload.user, note: payload.view.state.values.note.note.value, channel, ts, via: 'card' });
    return new Response('');
  }
  return new Response('');
}
