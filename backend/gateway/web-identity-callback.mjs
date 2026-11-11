// OAuth providers return to the API host. Credentials go only to the initiating
// Pages window; this endpoint creates no session and does not trust the proof.
export async function webIdentityCallback(request) {
  const url = new URL(request.url);
  if (url.pathname !== '/cpi/identity/web-callback') return null;
  if (!['GET', 'POST'].includes(request.method)) return new Response(null, { status: 405 });
  if (Number(request.headers.get('content-length') ?? 0) > 16_384)
    return new Response(null, { status: 413 });
  let fields;
  if (request.method === 'GET') fields = url.searchParams;
  else {
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))
      return new Response(null, { status: 415 });
    const reader = request.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader)
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 16_384) return new Response(null, { status: 413 });
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    fields = new URLSearchParams(new TextDecoder().decode(bytes));
  }
  const state = fields.get('state');
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) return new Response(null, { status: 400 });
  const result = { type: 'cpi-web-identity', state };
  for (const field of ['code', 'id_token', 'error']) {
    const value = fields.get(field);
    if (value && value.length <= 8192 && !/[\u0000-\u001f]/.test(value)) result[field] = value;
  }
  const nonce = crypto.randomUUID();
  // Escape HTML delimiters even though provider replies are never interpolated
  // as HTML. A hostile callback must not execute script in the gateway origin.
  const payload = JSON.stringify(result).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Crystal Path sign-in</title><script nonce="${nonce}">if(window.opener){window.opener.postMessage(${payload},'https://georgi-cole.github.io');window.close();}</script><p>You can return to Crystal Path.</p>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
        'cross-origin-opener-policy': 'unsafe-none',
      },
    },
  );
}
