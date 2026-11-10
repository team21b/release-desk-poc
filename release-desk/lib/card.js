// Builds the approval card from the PR itself: the PR template's sections + the changed components.
import { gh, repoUrl } from './github.js';

const ORG_LABELS = { sandbox: process.env.SANDBOX_LABEL || '21B Dev 2', prod: process.env.PROD_LABEL || '21B Dev 1' };

function section(body = '', heading) {
  const clean = body.replace(/<!--[\s\S]*?-->/g, '');
  const m = clean.match(new RegExp(`##\\s*${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|\\n---|$)`, 'i'));
  return m ? m[1].trim() : '';
}

const mrkdwn = (s) => s.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/\[(.+?)\]\((.+?)\)/g, '<$2|$1>').slice(0, 2900);

function component(path) {
  const m = path.match(/force-app\/main\/default\/(.+)$/);
  if (!m) return null;
  const parts = m[1].split('/');
  const name = parts.at(-1).replace(/-meta\.xml$/, '').replace(/\.[^.]+$/, '');
  if (parts[0] === 'objects') {
    const kind = parts.length > 3 ? parts[2].replace(/s$/, '') : 'object';
    return `${parts[1]}${parts.length > 3 ? '.' + name : ''} _(${kind})_`;
  }
  return `${name} _(${parts[0].replace(/s$/, '')})_`;
}

const STATUS = {
  pending: () => null,
  approved: (s) => `✅ Approved by <@${s.by}> — deploying to *${ORG_LABELS.prod}*…`,
  changes: (s) => `🔁 Changes requested by <@${s.by}>${s.note ? `: _${s.note.slice(0, 300)}_` : ''}`,
  live: (s) => `🚀 *Live in ${ORG_LABELS.prod}*${s.runUrl ? ` · <${s.runUrl}|deploy log>` : ''}`,
  failed: (s) => `❌ Production deploy failed — nothing changed in ${ORG_LABELS.prod}.${s.runUrl ? ` <${s.runUrl}|See log>` : ''}`,
  closed: () => `⚪ This PR was closed or merged outside Release Desk.`,
};

export async function buildCard(prNumber, state = { status: 'pending' }) {
  const pr = await gh(`/pulls/${prNumber}`);
  const files = await gh(`/pulls/${prNumber}/files?per_page=100`);
  const comps = [...new Set(files.map((f) => component(f.filename)).filter(Boolean))];

  const what = section(pr.body, 'What changed') || '_No description._';
  const who = section(pr.body, 'Who it affects');
  const risk = (section(pr.body, 'Risk').match(/- \[x\] .+/gi) || []).map((l) => '• ' + l.replace(/- \[x\] /i, ''));
  const rollback = section(pr.body, 'Rollback');

  const titles = { pending: '🚦 Ready for your review', approved: '✅ Approved', changes: '🔁 Changes requested', live: '🚀 Shipped', failed: '❌ Deploy failed', closed: '⚪ Closed' };
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: titles[state.status] || titles.pending } },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*<${pr.html_url}|#${pr.number} · ${pr.title}>*\nBuilt by *${pr.user.login}* · running now in *${ORG_LABELS.sandbox}* (sandbox)` },
    },
    { type: 'section', text: { type: 'mrkdwn', text: `*What changed*\n${mrkdwn(what)}` } },
  ];
  if (who) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Who it affects*\n${mrkdwn(who)}` } });
  const facts = [];
  if (risk.length) facts.push({ type: 'mrkdwn', text: `*Risk*\n${risk.join('\n')}` });
  if (rollback) facts.push({ type: 'mrkdwn', text: `*Rollback*\n${mrkdwn(rollback).slice(0, 1900)}` });
  if (facts.length) blocks.push({ type: 'section', fields: facts });
  if (comps.length)
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `*${comps.length} component${comps.length > 1 ? 's' : ''}:* ${comps.slice(0, 12).join(' · ')}${comps.length > 12 ? ' …' : ''}` }] });
  for (const shot of state.screenshots || []) blocks.push({ type: 'image', image_url: shot.url, alt_text: shot.alt || 'screenshot' });
  blocks.push({ type: 'divider' });

  const status = STATUS[state.status]?.(state);
  const value = JSON.stringify({ pr: pr.number, sha: pr.head.sha });
  if (state.status === 'pending' || state.status === 'changes') {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button', action_id: 'approve', style: 'primary', value,
          text: { type: 'plain_text', text: 'Approve & ship' },
          confirm: {
            title: { type: 'plain_text', text: 'Ship to production?' },
            text: { type: 'mrkdwn', text: `Merges #${pr.number} and deploys it to *${ORG_LABELS.prod}*.` },
            confirm: { type: 'plain_text', text: 'Ship it' },
            deny: { type: 'plain_text', text: 'Not yet' },
          },
        },
        { type: 'button', action_id: 'request_changes', value, text: { type: 'plain_text', text: 'Request changes' } },
        { type: 'button', action_id: 'view_pr', url: pr.html_url, text: { type: 'plain_text', text: 'View PR' } },
      ],
    });
  }
  if (status) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: status }] });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Release Desk · <${repoUrl}|${repoUrl.replace('https://github.com/', '')}> · commit \`${pr.head.sha.slice(0, 7)}\`` }] });

  return { pr, blocks, text: `${titles[state.status] || titles.pending}: #${pr.number} ${pr.title}` };
}
