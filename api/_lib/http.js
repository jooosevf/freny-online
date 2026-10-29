import { verifyIdToken } from './firebase-auth.js';

export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'the-rise-of-freny';

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// The server's secret (Vercel env var SCORE_KEY). The same key is in the published Firestore
// rules, which only take a score that carries sha256("<key>|uid|board|score").
export function scoreKey() {
  const key = process.env.SCORE_KEY;
  return key && key.length >= 32 ? key : null;
}

// POST with the player's Firebase ID token: returns { uid, body } or an error Response.
export async function readRequest(request) {
  if (request.method !== 'POST') return { error: json(405, { error: 'use POST' }) };
  const auth = request.headers.get('authorization') || '';
  const uid = auth.startsWith('Bearer ') ? await verifyIdToken(auth.slice(7), PROJECT_ID) : null;
  if (!uid) return { error: json(401, { error: 'login inválido' }) };
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: json(400, { error: 'JSON inválido' }) };
  }
  return { uid, body: body || {} };
}
