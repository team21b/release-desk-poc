// GitHub App auth (RS256 JWT → installation token) with zero dependencies.
import crypto from 'node:crypto';

const OWNER = process.env.GITHUB_OWNER || 'team21b';
const REPO = process.env.GITHUB_REPO || 'release-desk-poc';
const API = 'https://api.github.com';
export const repoUrl = `https://github.com/${OWNER}/${REPO}`;

const baseHeaders = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'release-desk',
};

function appJwt() {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iat: now - 60, exp: now + 540, iss: process.env.GITHUB_APP_ID })}`;
  const key = (process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url');
  return `${unsigned}.${sig}`;
}

let cached;
async function installationToken() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const headers = { ...baseHeaders, Authorization: `Bearer ${appJwt()}` };
  const inst = await (await fetch(`${API}/repos/${OWNER}/${REPO}/installation`, { headers })).json();
  if (!inst.id) throw new Error(`GitHub App is not installed on ${OWNER}/${REPO}: ${inst.message}`);
  const tok = await (await fetch(`${API}/app/installations/${inst.id}/access_tokens`, { method: 'POST', headers })).json();
  if (!tok.token) throw new Error(`Could not mint installation token: ${tok.message}`);
  cached = { token: tok.token, exp: Date.parse(tok.expires_at) };
  return tok.token;
}

export async function gh(path, { method = 'GET', body } = {}) {
  const token = await installationToken();
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}${path}`, {
    method,
    headers: { ...baseHeaders, Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(`GitHub ${method} ${path} → ${res.status}: ${data?.message}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// The Slack message for a PR is remembered in a hidden marker inside a PR comment — no database needed.
export async function findMarker(pr) {
  const comments = await gh(`/issues/${pr}/comments?per_page=100`);
  for (const c of comments.reverse()) {
    const m = c.body?.match(/<!-- release-desk:(\{.*?\}) -->/);
    if (m) return JSON.parse(m[1]);
  }
  return null;
}

export const markerBody = (text, data) => `${text}\n\n<!-- release-desk:${JSON.stringify(data)} -->`;

// Raw file bytes from a branch (used for review screenshots on the release-desk-assets branch).
export async function ghRaw(path, ref) {
  const token = await installationToken();
  const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${path}?ref=${encodeURIComponent(ref)}`, {
    headers: { ...baseHeaders, Accept: 'application/vnd.github.raw', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}
