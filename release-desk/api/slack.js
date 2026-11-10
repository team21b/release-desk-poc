// Slack interactivity endpoint: card buttons (Approve & ship / Request changes) and the change-request modal.
import { slack, verifySlack, respond, isApprover, approverMentions } from '../lib/slack.js';
import { act } from '../lib/actions.js';

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
