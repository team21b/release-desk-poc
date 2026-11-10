// Reports which settings are present (never their values) and what the GitHub App is allowed to do.
import { appInstallation } from '../lib/github.js';

const KEYS = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'APPROVER_SLACK_ID', 'GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'NOTIFY_TOKEN', 'REVIEW_CHANNEL', 'ACCESS_SIGNING_KEY', 'ACCESS_USERS'];
export async function GET() {
  const out = Object.fromEntries(KEYS.map((k) => [k, Boolean(process.env[k])]));
  try { const i = await appInstallation(); out.github_app = { permissions: i.permissions, repository_selection: i.repository_selection }; }
  catch (e) { out.github_app = { error: e.message }; }
  return Response.json(out);
}
