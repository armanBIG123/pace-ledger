// Replies for every PaceLedger server function: the browser may call them
// from the app (CORS), and nothing they return is ever cached.

export const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  ...NO_CACHE,
};

// A JSON reply. Pass NO_CACHE as headers for a server-to-server endpoint
// (a webhook) that browsers never call.
export function json(body: unknown, status = 200, headers: Record<string, string> = CORS): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

// The browser's CORS check before a POST.
export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: CORS }) : null;
}
