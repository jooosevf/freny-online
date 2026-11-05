import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.SCORE_KEY = 'x'.repeat(32);
delete process.env.FIREBASE_SERVICE_ACCOUNT;
const b64 = (x) => Buffer.from(x).toString('base64url');

let tokenChecks = 0;
globalThis.fetch = async (url) => {
  if (url.includes('securetoken')) {
    tokenChecks++;
    return new Response(JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }] }),
      { status: 200, headers: { 'cache-control': 'no-store' } });
  }
  throw new Error('unexpected ' + url);
};

const { tooMany, check, retryAfter, forgetAll, clientIp, LIMITS } = await import('../api/_lib/rate-limit.js');
const { default: start } = await import('../api/run/start.js');
const { default: finish } = await import('../api/run/finish.js');
const { refusedLogId } = await import('../api/_lib/review.js');

function idToken(uid) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
  const body = b64(JSON.stringify({ aud: 'the-rise-of-freny', iss: 'https://securetoken.google.com/the-rise-of-freny',
    sub: uid, iat: now, exp: now + 3600, firebase: { sign_in_provider: 'password' } }));
  const sign = createSign('RSA-SHA256');
  sign.update(head + '.' + body);
  return head + '.' + body + '.' + sign.sign(privateKey, 'base64url');
}

function call(handler, uid, ip, body = { board: 'leaderboard_hard' }) {
  return handler(new Request('http://x/api', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + idToken(uid), 'Content-Type': 'application/json', 'x-forwarded-for': ip + ', 10.0.0.1' },
    body: JSON.stringify(body),
  }));
}

test('a key gets its calls in the window, then waits until the oldest one leaves it', () => {
  forgetAll();
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(tooMany('k', t + i, 3, 60000), false);
  assert.equal(tooMany('k', t + 10, 3, 60000), true);
  assert.equal(retryAfter('k', t + 10, 60000), 60);
  assert.equal(tooMany('other', t + 10, 3, 60000), false);
  assert.equal(tooMany('k', t + 60001, 3, 60000), false);
});

test('each route counts on its own, per account and per address', () => {
  forgetAll();
  const t = 2_000_000;
  for (let i = 0; i < LIMITS.finish.uid; i++) assert.equal(check('finish', 'uid', 'u1', t), 0);
  assert.ok(check('finish', 'uid', 'u1', t) > 0);
  assert.equal(check('claim', 'uid', 'u1', t), 0);
  assert.equal(check('finish', 'uid', 'u2', t), 0);
  assert.equal(check('finish', 'nada', 'u1', t), 0);   // no rule, no limit
});

test('the client address is the first forwarded hop', () => {
  const r = (h) => new Request('http://x', { headers: h });
  assert.equal(clientIp(r({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })), '1.2.3.4');
  assert.equal(clientIp(r({ 'x-real-ip': '5.6.7.8', 'x-forwarded-for': '1.2.3.4' })), '5.6.7.8');
  assert.equal(clientIp(r({})), 'sem-ip');
});

test('one account spamming /api/run/start gets 429 with Retry-After; another account still plays', async () => {
  forgetAll();
  for (let i = 0; i < LIMITS.start.uid; i++) assert.equal((await call(start, 'spam', '1.1.1.1')).status, 200);
  const res = await call(start, 'spam', '1.1.1.1');
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) >= 1);
  assert.match((await res.json()).error, /espere/);
  assert.equal((await call(start, 'friend', '2.2.2.2')).status, 200);
});

test('one address with many accounts is stopped before the token is even checked', async () => {
  forgetAll();
  for (let i = 0; i < LIMITS.finish.ip; i++) await call(finish, 'acc' + i, '3.3.3.3', {});
  const before = tokenChecks;
  const res = await call(finish, 'acc-new', '3.3.3.3', {});
  assert.equal(res.status, 429);
  assert.equal(tokenChecks, before);
});

test('a refused run is kept under one id per account per hour', () => {
  const t = Date.UTC(2026, 10, 4, 23, 10);
  assert.equal(refusedLogId('u1', t), 'refused_u1_2026110423');
  assert.equal(refusedLogId('u1', t + 40 * 60000), 'refused_u1_2026110423');
  assert.equal(refusedLogId('u1', t + 60 * 60000), 'refused_u1_2026110500');
  assert.equal(refusedLogId('a/b..c', t), 'refused_abc_2026110423');
});
