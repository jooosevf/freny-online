import { readIdToken } from './firebase-auth.js';
import { check, clientIp } from './rate-limit.js';

export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'the-rise-of-freny';

// Any page may call the API: the player is identified by the Firebase token, not by cookies, so
// a copy of the game on another address (a Vercel alias, a custom domain) works the same.
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...headers },
  });
}

// 429 for a caller over its limit (rate-limit.js); the game shows the error as the reason
export function slowDown(seconds) {
  return json(429, { error: `muitas tentativas seguidas, espere ${seconds} s` }, { 'Retry-After': String(seconds) });
}

// The server's secret (Vercel env var SCORE_KEY). The same key is in the published Firestore
// rules, which only take a score that carries sha256("<key>|uid|board|score").
export function scoreKey() {
  const key = process.env.SCORE_KEY;
  return key && key.length >= 32 ? key : null;
}

// POST with the player's Firebase ID token: returns { uid, anonymous, body } or an error Response.
// With a route (a key of LIMITS in rate-limit.js), the address is counted before the token is
// checked and the account right after, and a caller over the limit gets 429.
export async function readRequest(request, route) {
  if (request.method === 'OPTIONS') return { error: new Response(null, { status: 204, headers: CORS }) };
  if (request.method !== 'POST') return { error: json(405, { error: 'use POST' }) };
  const ipWait = route ? check(route, 'ip', clientIp(request)) : 0;
  if (ipWait) return { error: slowDown(ipWait) };
  const auth = request.headers.get('authorization') || '';
  const who = auth.startsWith('Bearer ') ? await readIdToken(auth.slice(7), PROJECT_ID) : null;
  if (!who) return { error: json(401, { error: 'login inválido' }) };
  const uidWait = route ? check(route, 'uid', who.uid) : 0;
  if (uidWait) return { error: slowDown(uidWait) };
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: json(400, { error: 'JSON inválido' }) };
  }
  return { uid: who.uid, anonymous: who.anonymous, body: body || {} };
}
