// Reports which settings are present (never their values).
const KEYS = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'APPROVER_SLACK_ID', 'GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'NOTIFY_TOKEN', 'REVIEW_CHANNEL'];
export function GET() {
  return Response.json(Object.fromEntries(KEYS.map((k) => [k, Boolean(process.env[k])])));
}
