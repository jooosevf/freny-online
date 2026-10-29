import { b64url, fromB64url, hmac, sameText } from './crypto.js';

// The run ticket: who, which board and when the run started by the server's clock, signed with
// the server key. Nothing is stored; the signature is what proves the server handed it out.
export async function makeRunToken(key, uid, board, startedAt) {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(9)));
  const body = b64url(new TextEncoder().encode(JSON.stringify({ u: uid, b: board, s: startedAt, n: nonce })));
  return body + '.' + (await hmac(key, 'run|' + body));
}

export async function readRunToken(key, token) {
  const [body, sig] = (typeof token === 'string' ? token : '').split('.');
  if (!body || !sig || !sameText(sig, await hmac(key, 'run|' + body))) return null;
  try {
    const t = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return { uid: t.u, board: t.b, startedAt: t.s };
  } catch {
    return null;
  }
}
