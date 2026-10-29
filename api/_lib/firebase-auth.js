import { fromB64url } from './crypto.js';

// Checks a Firebase Auth ID token (the one the game already sends to Firestore) and returns
// the player's uid, or null. https://firebase.google.com/docs/auth/admin/verify-id-tokens
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let keys = null;
let keysUntil = 0;

async function publicKeys() {
  if (keys && Date.now() < keysUntil) return keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error('Google keys ' + res.status);
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  keys = (await res.json()).keys;
  keysUntil = Date.now() + (maxAge ? Number(maxAge[1]) : 3600) * 1000;
  return keys;
}

export async function verifyIdToken(token, projectId) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return null;
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;
  const jwk = (await publicKeys()).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) return null;
  const now = Date.now() / 1000;
  if (claims.aud !== projectId || claims.iss !== 'https://securetoken.google.com/' + projectId) return null;
  if (!(claims.exp > now) || !(claims.iat <= now + 60) || typeof claims.sub !== 'string' || !claims.sub) return null;
  return claims.sub;
}
