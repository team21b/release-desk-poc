// Release Desk's public URL for a change (the Work Object's identity); sends people on to the PR.
import { repoUrl } from '../lib/github.js';

export function GET(request) {
  const n = Number(new URL(request.url).searchParams.get('n'));
  if (!Number.isInteger(n) || n < 1) return new Response('not found', { status: 404 });
  return Response.redirect(`${repoUrl}/pull/${n}`, 302);
}
