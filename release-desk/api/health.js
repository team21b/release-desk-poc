// Reports which settings are present (never their values) and what the GitHub App is allowed to do.
import { appInstallation, appInfo } from '../lib/github.js';

const KEYS = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'APPROVER_SLACK_ID', 'GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'NOTIFY_TOKEN', 'REVIEW_CHANNEL', 'ACCESS_SIGNING_KEY', 'ACCESS_USERS'];
export async function GET() {
  const out = Object.fromEntries(KEYS.map((k) => [k, Boolean(process.env[k])]));
  try { const i = await appInstallation(); const a = await appInfo(); out.github_app = { accepted_by_installation: i.permissions, requested_by_app: a.permissions, owner: a.owner?.login, installed_on: i.account?.login }; }
  catch (e) { out.github_app = { error: e.message }; }
  return Response.json(out);
}
