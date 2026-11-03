import { json, CORS, PROJECT_ID } from './_lib/http.js';
import { readIdToken } from './_lib/firebase-auth.js';
import { addDoc, getDoc, hasAdminDb } from './_lib/admin-db.js';
import { readFeedback, tooMany } from './_lib/feedback.js';
import { sha256Hex } from './_lib/crypto.js';

export const config = { runtime: 'edge' };

// POST /api/feedback { tipo, texto, nota?, contato?, plataforma? }, with the player's Firebase
// token when they are signed in on the site (then the apelido goes along).
export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'use POST' });
  if (!hasAdminDb()) return json(503, { error: 'FIREBASE_SERVICE_ACCOUNT não configurada' });
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'JSON inválido' });
  }
  const read = readFeedback(body);
  if (read.error === 'spam') return json(200, { ok: true });
  if (read.error) return json(400, { error: read.error });

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sem-ip';
  const who = (await sha256Hex('feedback|' + ip)).slice(0, 16);
  if (tooMany(who)) return json(429, { error: 'muitos feedbacks seguidos, espere uns minutos' });

  const doc = { ...read.value, criadoEm: new Date(), origem: who };
  const auth = request.headers.get('authorization') || '';
  const user = auth.startsWith('Bearer ') ? await readIdToken(auth.slice(7), PROJECT_ID).catch(() => null) : null;
  if (user) {
    doc.uid = user.uid;
    const perfil = await getDoc('perfis/' + user.uid).catch(() => null);
    if (perfil && perfil.apelido) doc.apelido = perfil.apelido;
  }
  try {
    await addDoc('feedback', doc);
  } catch (e) {
    console.log('feedback write failed: ' + e.message);
    return json(502, { error: 'não deu para salvar agora' });
  }
  console.log(`feedback ${doc.tipo} ${doc.uid || 'convidado'}`);
  return json(200, { ok: true });
}
