// How often one player (and one address) may call the API, so nobody can hammer it with scripts:
// every call checks a Firebase token, and /api/run/finish reads and writes Firestore, whose free
// plan has a daily quota. Best effort: each server instance counts on its own, so a burst spread
// over many instances gets through a few times over, but a script on one connection is stopped.
// A refusal is 429 with Retry-After; the game shows the message and the player can try again.

// calls per minute for each route, per account (uid) and per address (ip). A real run calls
// start once, and finish/claim once or twice at the end, so these only stop scripts.
export const LIMITS = {
  start: { uid: 20, ip: 60 },
  finish: { uid: 6, ip: 30 },
  claim: { uid: 6, ip: 30 },
  feedback: { ip: 5, windowMs: 10 * 60 * 1000 },
};
const MINUTE = 60 * 1000;
const MAX_KEYS = 20000;   // memory guard: past this, the oldest half is forgotten

const recent = new Map();

// true when `key` already made `limit` calls inside the window (and the call isn't counted);
// otherwise counts it and returns false
export function tooMany(key, now = Date.now(), limit = 5, windowMs = MINUTE) {
  const list = (recent.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    recent.set(key, list);
    return true;
  }
  list.push(now);
  recent.delete(key);   // re-insert so the Map stays in last-used order
  recent.set(key, list);
  if (recent.size > MAX_KEYS) {
    let drop = recent.size / 2;
    for (const k of recent.keys()) {
      if (drop-- <= 0) break;
      recent.delete(k);
    }
  }
  return false;
}

// seconds until the oldest counted call leaves the window
export function retryAfter(key, now = Date.now(), windowMs = MINUTE) {
  const list = recent.get(key) || [];
  return list.length ? Math.max(1, Math.ceil((list[0] + windowMs - now) / 1000)) : 1;
}

export function forgetAll() {
  recent.clear();
}

// the caller's address as Vercel passes it (the first x-forwarded-for hop is the client)
export function clientIp(request) {
  return (request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0]).trim() || 'sem-ip';
}

// checks one route for one kind of caller; returns the seconds to wait, or 0 when the call may go on
export function check(route, kind, id, now = Date.now()) {
  const rule = LIMITS[route];
  if (!rule || !rule[kind]) return 0;
  const key = route + '|' + kind + '|' + id;
  const windowMs = rule.windowMs || MINUTE;
  return tooMany(key, now, rule[kind], windowMs) ? retryAfter(key, now, windowMs) : 0;
}
