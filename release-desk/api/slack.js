// Slack interactivity endpoint: Approve & ship / Request changes.
import { gh, findMarker } from '../lib/github.js';
import { slack, verifySlack, respond, isApprover, approverMentions } from '../lib/slack.js';
import { buildCard } from '../lib/card.js';

async function refresh(channel, ts, pr, state, prefix) {
  const { blocks, text } = await buildCard(pr, state);
  await slack('chat.update', {
    channel, ts, text,
    blocks: prefix ? [{ type: 'section', text: { type: 'mrkdwn', text: prefix } }, ...blocks] : blocks,
  });
}

async function thread(channel, ts, text) {
  await slack('chat.postMessage', { channel, thread_ts: ts, text });
}

async function approve({ pr, sha, channel, ts, user }) {
  const live = await gh(`/pulls/${pr}`);
  if (live.state !== 'open') return thread(channel, ts, `This PR is already ${live.merged ? 'merged' : 'closed'} — nothing to do.`);
  if (live.head.sha !== sha) {
    return thread(channel, ts, `⚠️ Not shipped: new commits landed after this card was sent. The card will refresh once the sandbox deploy finishes — please review the latest version.`);
  }
  try {
    await gh(`/pulls/${pr}/merge`, {
      method: 'PUT',
      body: { sha, merge_method: 'squash', commit_title: `${live.title} (#${pr})`, commit_message: `Approved in Slack by ${user.name} (${user.id}) via Release Desk.` },
    });
  } catch (e) {
    return thread(channel, ts, `❌ Couldn't merge: ${e.message}`);
  }
  const files = await gh(`/pulls/${pr}/files?per_page=100`);
  const deploys = files.some((f) => f.filename.startsWith('force-app/') || f.filename === 'sfdx-project.json');
  await gh(`/issues/${pr}/comments`, { method: 'POST', body: { body: `✅ Approved in Slack by **${user.name}** — merged${deploys ? '; production deploy starting' : ' (no Salesforce changes)'}.` } });
  await refresh(channel, ts, pr, { status: deploys ? 'approved' : 'merged', by: user.id });
  await thread(channel, ts, deploys
    ? `✅ Approved by <@${user.id}>. Merged and deploying to production — I'll post here when it's live.`
    : `✅ Approved by <@${user.id}>. Merged — no Salesforce changes, so nothing goes to production.`);
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
    if (action.action_id === 'approve') await approve({ pr, sha, channel, ts, user: payload.user });
    else await slack('views.open', { trigger_id: payload.trigger_id, view: changesModal({ pr, channel, ts }) });
    return new Response('');
  }

  if (payload.type === 'view_submission' && payload.view.callback_id === 'request_changes') {
    if (!isApprover(payload.user.id)) return new Response('');
    const { pr, channel, ts } = JSON.parse(payload.view.private_metadata);
    const note = payload.view.state.values.note.note.value;
    await gh(`/issues/${pr}/comments`, { method: 'POST', body: { body: `🔁 **Changes requested in Slack by ${payload.user.name}:**\n\n> ${note.replace(/\n/g, '\n> ')}` } });
    await refresh(channel, ts, pr, { status: 'changes', by: payload.user.id, note });
    await thread(channel, ts, `🔁 <@${payload.user.id}> sent this back:\n>${note.replace(/\n/g, '\n>')}`);
    return new Response('');
  }
  return new Response('');
}
