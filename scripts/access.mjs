// Time-boxed production access. Runs ONLY in GitHub Actions on main (Production environment).
//   apply: verify a Release Desk-signed approval, then grant/revoke an allow-listed permission set group with an expiry.
//   sweep: remove any ELEVATE assignment past its expiry (backstop for Salesforce's own expiry processing).
// Logs are public on this repo: never print user ids, payloads or tokens.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const mode = process.argv[2];
const bundles = JSON.parse(fs.readFileSync('access/bundles.json', 'utf8')).bundles;
const sf = (args) => {
  try { return JSON.parse(execFileSync('sf', [...args, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
  catch (e) { const out = e.stdout ? JSON.parse(e.stdout) : {}; throw new Error(out.message || 'sf command failed'); }
};
const soql = (q) => sf(['data', 'query', '-o', 'target', '-q', q]).result.records;
const safeId = (id) => { if (!/^[a-zA-Z0-9]{15,18}$/.test(id || '')) throw new Error('invalid record id'); return id; };

async function report(body) {
  const url = process.env.RELEASE_DESK_URL;
  if (!url) return;
  await fetch(`${url}/api/access-report`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RELEASE_DESK_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, run_url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` }),
  }).catch(() => {});
}

function verify() {
  const payload = process.env.PAYLOAD || '';
  const sig = process.env.SIGNATURE || '';
  const want = crypto.createHmac('sha256', process.env.ACCESS_SIGNING_KEY || '').update(payload).digest('hex');
  if (!process.env.ACCESS_SIGNING_KEY || want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig)))
    throw new Error('signature check failed — this request was not approved through Release Desk');
  const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (!(p.exp > Date.now() / 1000)) throw new Error('approval expired before it was used');
  return p;
}

const psgId = (bundle) => {
  const rows = soql(`SELECT Id, Status FROM PermissionSetGroup WHERE DeveloperName = '${bundle.permissionSetGroup}'`);
  if (!rows.length) throw new Error(`permission set group ${bundle.permissionSetGroup} is not in this org`);
  return rows[0].Id;
};

if (mode === 'apply') {
  let p;
  try {
    p = verify();
    const bundle = bundles.find((b) => b.key === p.bundle);
    if (!bundle) throw new Error('bundle is not on the allowlist');
    const user = safeId(p.sfUser);
    const group = psgId(bundle);
    const existing = soql(`SELECT Id FROM PermissionSetAssignment WHERE AssigneeId = '${user}' AND PermissionSetGroupId = '${group}'`);
    if (p.action === 'grant') {
      if (!bundle.durations.includes(p.minutes)) throw new Error('duration is not allowed for this bundle');
      const expires = new Date(Date.now() + p.minutes * 60_000).toISOString().replace(/\.\d+Z$/, '.000Z');
      if (existing.length) sf(['data', 'update', 'record', '-o', 'target', '-s', 'PermissionSetAssignment', '-i', existing[0].Id, '-v', `ExpirationDate=${expires}`]);
      else sf(['data', 'create', 'record', '-o', 'target', '-s', 'PermissionSetAssignment', '-v', `AssigneeId=${user} PermissionSetGroupId=${group} ExpirationDate=${expires}`]);
      console.log(`granted ${bundle.label} for ${p.minutes} minutes`);
      await report({ ...p, result: 'granted', expires });
    } else if (p.action === 'revoke') {
      for (const a of existing) sf(['data', 'delete', 'record', '-o', 'target', '-s', 'PermissionSetAssignment', '-i', a.Id]);
      console.log(`revoked ${bundle.label} (${existing.length} assignment${existing.length === 1 ? '' : 's'})`);
      await report({ ...p, result: 'revoked' });
    } else throw new Error('unknown action');
  } catch (e) {
    console.log(`::error::${e.message}`);
    if (p) await report({ ...p, result: 'failed', error: e.message });
    process.exit(1);
  }
} else if (mode === 'sweep') {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  let removed = 0;
  for (const b of bundles) {
    let group; try { group = psgId(b); } catch { continue; }
    for (const a of soql(`SELECT Id FROM PermissionSetAssignment WHERE PermissionSetGroupId = '${group}' AND ExpirationDate != null AND ExpirationDate < ${now}`)) {
      sf(['data', 'delete', 'record', '-o', 'target', '-s', 'PermissionSetAssignment', '-i', a.Id]); removed++;
    }
  }
  console.log(`sweep: removed ${removed} expired assignment(s)`);
} else { console.log('usage: access.mjs apply|sweep'); process.exit(2); }
