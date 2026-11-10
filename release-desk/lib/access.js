// Time-boxed production access: /elevate modal → approval card → signed request → GitHub Actions grants it in
// Salesforce with an expiry. Release Desk never holds production credentials; it only signs approved requests.
import crypto from 'node:crypto';
import { gh, ghRaw } from './github.js';
import { isApprover } from './slack.js';

const PROD = process.env.PROD_LABEL || '21B Dev 1';

export async function loadBundles() {
  const raw = await ghRaw('access/bundles.json', 'main');
  return raw ? JSON.parse(raw.toString()).bundles : [];
}

// ACCESS_USERS = "SlackUserId:SalesforceUserId,…" — who may ask, and which production user receives the grant.
export function sfUserFor(slackId) {
  const map = Object.fromEntries((process.env.ACCESS_USERS || '').split(',').map((p) => p.split(':').map((s) => s.trim())).filter((p) => p.length === 2));
  return map[slackId] || null;
}

export const selfApprovalAllowed = () => process.env.ACCESS_ALLOW_SELF_APPROVE === 'true';
export const canApprove = (approverId, requesterId) => isApprover(approverId) && (approverId !== requesterId || selfApprovalAllowed());
export const duration = (m) => (m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`);

export async function dispatch(request) {
  const payload = Buffer.from(JSON.stringify({ ...request, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.ACCESS_SIGNING_KEY || '').update(payload).digest('hex');
  await gh('/actions/workflows/access.yml/dispatches', { method: 'POST', body: { ref: 'main', inputs: { payload, signature } } });
}

export function requestModal(bundles) {
  const b = bundles[0];
  const opt = (text, value, description) => ({ text: { type: 'plain_text', text }, value, ...(description ? { description: { type: 'plain_text', text: description.slice(0, 75) } } : {}) });
  const durations = b.durations.map((m) => opt(duration(m), String(m)));
  return {
    type: 'modal',
    callback_id: 'access_request',
    title: { type: 'plain_text', text: 'Request access' },
    submit: { type: 'plain_text', text: 'Send for approval' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `Ask for *temporary* elevated access in *${PROD}* (production). An approver says yes or no in Slack, and Salesforce removes the access automatically when time is up.` } },
      { type: 'input', block_id: 'bundle', label: { type: 'plain_text', text: 'Access' }, element: { type: 'static_select', action_id: 'v', options: bundles.map((x) => opt(x.label, x.key, x.grants)), initial_option: opt(b.label, b.key, b.grants) } },
      { type: 'input', block_id: 'minutes', label: { type: 'plain_text', text: 'For how long' }, element: { type: 'static_select', action_id: 'v', options: durations, initial_option: durations.find((d) => d.value === '60') || durations[0] } },
      { type: 'input', block_id: 'reason', label: { type: 'plain_text', text: 'What will you do with it?' }, element: { type: 'plain_text_input', action_id: 'v', multiline: true, max_length: 500 } },
    ],
  };
}

const HEAD = {
  pending: '🔐 Access request', approved: '⏳ Approved — granting…', granted: '🔓 Access granted', denied: '⛔ Access denied',
  revoking: '⏳ Revoking…', revoked: '🔒 Access removed', failed: '❌ Grant failed', withdrawn: '↩️ Request withdrawn',
};

// r = { id, requester, sfUser, bundle, label, grants, minutes }  (the reason lives in the card's thread)
export function accessCard(r, s = { status: 'pending' }) {
  const value = JSON.stringify(r);
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: HEAD[s.status] } },
    { type: 'section', text: { type: 'mrkdwn', text: `<@${r.requester}> ${s.status === 'pending' ? 'requests' : 'requested'} *${r.label}* for *${duration(r.minutes)}* in *${PROD}* (production).\n_Grants: ${r.grants}._` } },
  ];
  const ctx = [];
  if (s.status === 'pending') ctx.push('Reason is in the thread. Approving grants it immediately; Salesforce removes it when time is up.');
  if (s.by) ctx.push(`${s.status === 'denied' ? 'Denied' : s.status === 'revoked' || s.status === 'revoking' ? 'Removed' : 'Approved'} by <@${s.by}>`);
  if (s.expires) {
    const t = Math.floor(Date.parse(s.expires) / 1000);
    ctx.push(`Expires <!date^${t}^{time} on {date_short_pretty}|${s.expires}> — removed automatically`);
  }
  if (s.error) ctx.push(`Error: ${s.error}`);
  if (s.runUrl) ctx.push(`<${s.runUrl}|Audit log>`);
  if (selfApprovalAllowed() && s.status === 'pending') ctx.push('⚠️ Testing mode: self-approval is allowed');
  if (ctx.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: ctx.join(' · ') }] });
  if (s.status === 'pending') {
    blocks.push({ type: 'actions', elements: [
      { type: 'button', action_id: 'access_approve', style: 'primary', value, text: { type: 'plain_text', text: 'Approve' },
        confirm: { title: { type: 'plain_text', text: 'Grant production access?' }, text: { type: 'mrkdwn', text: `<@${r.requester}> gets *${r.label}* in *${PROD}* for *${duration(r.minutes)}*.` }, confirm: { type: 'plain_text', text: 'Grant' }, deny: { type: 'plain_text', text: 'Not yet' } } },
      { type: 'button', action_id: 'access_deny', style: 'danger', value, text: { type: 'plain_text', text: 'Deny' } },
    ] });
  }
  if (s.status === 'granted') {
    blocks.push({ type: 'actions', elements: [{ type: 'button', action_id: 'access_revoke', style: 'danger', value, text: { type: 'plain_text', text: 'Revoke now' } }] });
  }
  return { blocks, text: `${HEAD[s.status]}: ${r.label} for ${duration(r.minutes)}` };
}
