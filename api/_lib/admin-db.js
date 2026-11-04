import { b64url } from './crypto.js';
import { PROJECT_ID } from './http.js';

// Firestore as the server (a service account in the Vercel env var FIREBASE_SERVICE_ACCOUNT, the
// JSON key file José downloads from the Firebase console). The server's writes skip the rules, so
// it can keep what players can't touch: the runs waiting for review, every accepted run's log and
// the banned accounts. Plain REST and Web Crypto, like the rest of the API.

let cached = null;   // { token, until }

function serviceAccount() {
  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '');
    return sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

export function hasAdminDb() {
  return serviceAccount() !== null;
}

async function accessToken() {
  if (cached && Date.now() < cached.until) return cached.token;
  const sa = serviceAccount();
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const sig = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + unsigned + '.' + sig,
  });
  if (!res.ok) throw new Error('Google token ' + res.status);
  const body = await res.json();
  cached = { token: body.access_token, until: Date.now() + (body.expires_in - 120) * 1000 };
  return cached.token;
}

const ROOT = `projects/${PROJECT_ID}/databases/(default)/documents`;
const BASE = 'https://firestore.googleapis.com/v1/' + ROOT;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: 'Bearer ' + (await accessToken()), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore ${method} ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? {} : res.json();
}

// plain values <-> Firestore's typed fields
export function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v instanceof Date) fields[k] = { timestampValue: v.toISOString() };
    else if (Number.isInteger(v)) fields[k] = { integerValue: String(v) };
    else if (typeof v === 'number') fields[k] = { doubleValue: v };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else fields[k] = { stringValue: String(v) };
  }
  return fields;
}

export function fromFields(fields = {}) {
  const obj = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('integerValue' in v) obj[k] = Number(v.integerValue);
    else if ('doubleValue' in v) obj[k] = v.doubleValue;
    else if ('booleanValue' in v) obj[k] = v.booleanValue;
    else if ('timestampValue' in v) obj[k] = v.timestampValue;
    else obj[k] = v.stringValue ?? null;
  }
  return obj;
}

export async function getDoc(path) {
  const doc = await call('GET', '/' + path);
  return doc ? fromFields(doc.fields) : null;
}

export async function setDoc(path, obj) {
  await call('PATCH', '/' + path, { fields: toFields(obj) });
}

export async function addDoc(collection, obj) {
  await call('POST', '/' + collection, { fields: toFields(obj) });
}

export async function deleteDoc(path) {
  await call('DELETE', '/' + path);
}

// changes only these fields; setDoc replaces the whole document
export async function patchFields(path, obj) {
  const mask = Object.keys(obj).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  await call('PATCH', '/' + path + '?' + mask, { fields: toFields(obj) });
}

// every doc of a collection, page by page: [{ id, ...fields }]
export async function listAll(collection) {
  const all = [];
  let page = '';
  do {
    const body = await call('GET', `/${collection}?pageSize=300${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
    for (const d of body?.documents || []) {
      all.push({ id: d.name.slice(d.name.lastIndexOf('/') + 1), ...fromFields(d.fields) });
    }
    page = body?.nextPageToken || '';
  } while (page);
  return all;
}

// up to `limit` docs of a collection, highest `orderBy` first (or as stored): [{ id, ...fields }]
export async function listDocs(collection, orderBy, limit = 50) {
  const query = { from: [{ collectionId: collection }], limit };
  if (orderBy) query.orderBy = [{ field: { fieldPath: orderBy }, direction: 'DESCENDING' }];
  const rows = await call('POST', ':runQuery', { structuredQuery: query });
  return (rows || []).filter((r) => r.document).map((r) => ({
    id: r.document.name.slice(r.document.name.lastIndexOf('/') + 1),
    ...fromFields(r.document.fields),
  }));
}
