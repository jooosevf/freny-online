// The site's Feedback page (#feedback, /feedback). Anyone can send one, signed in or not; the
// server writes it to feedback/ with the service account, so no Firestore rule lets a player
// read or write that collection. José reads them in admin.html.
import { tooMany as countCall, LIMITS } from './rate-limit.js';

export const KINDS = ['bug', 'ideia', 'elogio', 'outro'];
export const MAX_TEXT = 2000;
export const MAX_CONTACT = 120;

function clean(s, max) {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

// { error } or { value: { tipo, texto, nota?, contato?, plataforma? } }
export function readFeedback(body) {
  body = body || {};
  if (body.site) return { error: 'spam' }; // the hidden field only bots fill in
  const tipo = KINDS.includes(body.tipo) ? body.tipo : null;
  if (!tipo) return { error: 'escolha o tipo do feedback' };
  const texto = clean(body.texto, MAX_TEXT + 1);
  if (texto.length < 5) return { error: 'escreva um pouco mais' };
  if (texto.length > MAX_TEXT) return { error: 'texto longo demais' };
  const value = { tipo, texto };
  if (body.nota !== undefined && body.nota !== null && body.nota !== '') {
    const nota = Number(body.nota);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) return { error: 'nota inválida' };
    value.nota = nota;
  }
  const contato = clean(body.contato, MAX_CONTACT);
  if (contato) value.contato = contato;
  const plataforma = body.plataforma === 'celular' || body.plataforma === 'pc' ? body.plataforma : null;
  if (plataforma) value.plataforma = plataforma;
  return { value };
}

// a few per address in a short window; best effort, per server instance (rate-limit.js)
export function tooMany(key, now = Date.now(), limit = LIMITS.feedback.ip, windowMs = LIMITS.feedback.windowMs) {
  return countCall('feedback|' + key, now, limit, windowMs);
}
