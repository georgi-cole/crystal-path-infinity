import { Buffer } from 'node:buffer';

export const Headers = globalThis.Headers;

// Apple publishes signed OCSP responses over HTTP. Use the RFC 5019 GET encoding
// because Apple's responder rejects Worker POSTs. The Apple SDK verifies the response.
export default async function fetchAppleOcsp(input, { body }) {
  const url = new URL(input);
  if (
    url.origin !== 'http://ocsp.apple.com' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/ocsp[0-9a-z-]+$/.test(url.pathname) ||
    !Buffer.isBuffer(body)
  )
    throw new Error('Invalid Apple OCSP request');

  const target = url.href + '/' + encodeURIComponent(body.toString('base64'));
  const response = await fetch(target, {
    headers: { accept: 'application/ocsp-response' },
    redirect: 'manual',
    signal: AbortSignal.timeout(8_000),
  });
  return {
    ok: response.ok,
    async buffer() {
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body) {
        length += chunk.byteLength;
        if (length > 65_536) throw new Error('Apple OCSP response too large');
        chunks.push(chunk);
      }
      return Buffer.concat(chunks, length);
    },
  };
}
