// Approve / request changes / reject — shared by the Slack card buttons and the in-Slack review page.
import { gh, findMarker } from './github.js';
import { slack } from './slack.js';
import { buildCard } from './card.js';

export const nameOf = (user) => {
  const map = Object.fromEntries((process.env.APPROVER_NAMES || '').split(',').map((p) => p.split(':').map((s) => s.trim())).filter((p) => p.length === 2));
  return map[user.id] || user.name || user.id;
};

async function where(pr, channel, ts) {
  if (channel && ts) return { channel, ts };
  const m = await findMarker(pr);
  return m ? { channel: m.channel, ts: m.ts } : {};
}

async function refresh(loc, pr, state) {
  if (!loc.channel) return;
  const { blocks, text } = await buildCard(pr, state);
  await slack('chat.update', { channel: loc.channel, ts: loc.ts, text, blocks });
}

const thread = (loc, text) => (loc.channel ? slack('chat.postMessage', { channel: loc.channel, thread_ts: loc.ts, text }) : null);

export async function act({ action, pr, sha, user, note, channel, ts, via = 'Slack' }) {
  const loc = await where(pr, channel, ts);
  const who = nameOf(user);
  const live = await gh(`/pulls/${pr}`);
  if (live.state !== 'open') return { ok: false, message: `This change is already ${live.merged ? 'merged' : 'closed'}.` };

  if (action === 'approve') {
    if (live.head.sha !== sha) {
      await thread(loc, `⚠️ Not shipped: new commits landed after this was reviewed. Please review the latest version.`);
      return { ok: false, message: 'New commits landed after you opened this. Reopen to review the latest version.' };
    }
    try {
      await gh(`/pulls/${pr}/merge`, {
        method: 'PUT',
        body: { sha, merge_method: 'squash', commit_title: `${live.title} (#${pr})`, commit_message: `Approved in Slack by ${who} (${user.id}) via Release Desk ${via}.` },
      });
    } catch (e) {
      await thread(loc, `❌ Couldn't merge: ${e.message}`);
      return { ok: false, message: `Couldn't merge: ${e.message}` };
    }
    const files = await gh(`/pulls/${pr}/files?per_page=100`);
    const deploys = files.some((f) => f.filename.startsWith('force-app/') || f.filename === 'sfdx-project.json');
    await gh(`/issues/${pr}/comments`, { method: 'POST', body: { body: `✅ Approved in Slack by **${who}** (${via}) — merged${deploys ? '; production deploy starting' : ' (no Salesforce changes)'}.` } });
    await refresh(loc, pr, { status: deploys ? 'approved' : 'merged', by: user.id });
    await thread(loc, deploys
      ? `✅ Approved by <@${user.id}>. Merged and deploying to production — I'll post here when it's live.`
      : `✅ Approved by <@${user.id}>. Merged — no Salesforce changes, so nothing goes to production.`);
    return { ok: true, status: deploys ? 'approved' : 'merged', message: deploys ? 'Approved. Deploying to production now — watch the Slack thread for the result.' : 'Approved and merged. No Salesforce changes to deploy.' };
  }

  if (action === 'request_changes') {
    const text = (note || '').trim() || '(no note)';
    await gh(`/issues/${pr}/comments`, { method: 'POST', body: { body: `🔁 **Changes requested in Slack by ${who}:**\n\n> ${text.replace(/\n/g, '\n> ')}` } });
    await refresh(loc, pr, { status: 'changes', by: user.id, note: text });
    await thread(loc, `🔁 <@${user.id}> sent this back:\n>${text.replace(/\n/g, '\n>')}`);
    return { ok: true, status: 'changes', message: 'Sent back with your note.' };
  }

  if (action === 'reject') {
    const text = (note || '').trim();
    await gh(`/issues/${pr}/comments`, { method: 'POST', body: { body: `⛔ **Rejected in Slack by ${who}.**${text ? `\n\n> ${text.replace(/\n/g, '\n> ')}` : ''}` } });
    await gh(`/pulls/${pr}`, { method: 'PATCH', body: { state: 'closed' } });
    await refresh(loc, pr, { status: 'rejected', by: user.id, note: text });
    await thread(loc, `⛔ <@${user.id}> rejected this change. The PR is closed; nothing reaches production.${text ? `\n>${text.replace(/\n/g, '\n>')}` : ''}`);
    return { ok: true, status: 'rejected', message: 'Rejected. The change is closed and will not ship.' };
  }
  return { ok: false, message: 'Unknown action.' };
}
