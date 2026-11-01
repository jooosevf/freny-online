import { json } from './http.js';
import { sameText } from './crypto.js';
import { hasAdminDb } from './admin-db.js';

// admin.html's calls carry ADMIN_TOKEN (a Vercel env var José picks) in X-Admin-Token.
export async function readAdmin(request) {
  if (request.method === 'OPTIONS') return { error: new Response(null, { status: 204 }) };
  if (request.method !== 'POST') return { error: json(405, { error: 'use POST' }) };
  const expected = process.env.ADMIN_TOKEN || '';
  const given = request.headers.get('x-admin-token') || '';
  if (expected.length < 16 || !sameText(given, expected)) return { error: json(401, { error: 'senha de admin errada' }) };
  if (!hasAdminDb()) return { error: json(503, { error: 'FIREBASE_SERVICE_ACCOUNT não configurada' }) };
  try {
    return { body: (await request.json()) || {} };
  } catch {
    return { body: {} };
  }
}
