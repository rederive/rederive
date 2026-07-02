// Edge middleware: count fetches of the agent-facing docs, classified by user-agent, via a fire-and-forget
// beacon to our own counter (Lambda + DynamoDB — no analytics vendor). Non-blocking: the response is never
// delayed or altered. No-ops safely if the env vars are absent. UA classification happens server-side in the
// counter; we ship only path + UA string.
export const config = { matcher: ['/prompt.md', '/llms.txt'] };

export default function middleware(request: Request, context: { waitUntil(p: Promise<unknown>): void }) {
  const url = process.env.METRICS_URL;
  const token = process.env.METRICS_TOKEN;
  if (url && token) {
    const path = new URL(request.url).pathname;
    const ua = request.headers.get('user-agent') || '';
    context.waitUntil(
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-beacon-token': token },
        body: JSON.stringify({ path, ua: ua.slice(0, 200) }),
      }).catch(() => {})
    );
  }
  // fall through to the static file
  return undefined;
}
