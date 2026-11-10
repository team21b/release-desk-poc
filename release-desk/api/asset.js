// Serves a PR's review screenshot to a holder of a valid review token.
import { verify } from '../lib/review.js';
import { ghRaw } from '../lib/github.js';

export async function GET(request) {
  const url = new URL(request.url);
  const data = verify(url.searchParams.get('t'));
  const name = url.searchParams.get('n');
  if (!data || !['before', 'after'].includes(name)) return new Response('not found', { status: 404 });
  const bytes = await ghRaw(`pr-${data.pr}/${name}.png`, process.env.ASSETS_BRANCH || 'release-desk-assets');
  if (!bytes) return new Response('not found', { status: 404 });
  return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=600' } });
}
