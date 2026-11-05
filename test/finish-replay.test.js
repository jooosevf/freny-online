import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.SCORE_KEY = 'x'.repeat(32);
process.env.REVIEW_MIN_SCORE = '50';
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
  client_email: 'api@the-rise-of-freny.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
});
const b64 = (x) => Buffer.from(x).toString('base64url');

// Google and Firestore, faked: the board's top comes from `top`, every write is noted
let top = [];
let writes = [];
globalThis.fetch = async (url, init = {}) => {
  if (url.includes('securetoken')) {
    return new Response(JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }] }),
      { status: 200, headers: { 'cache-control': 'max-age=3600' } });
  }
  if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
  if (url.includes('/bans/') || url.includes('/saves/')) return new Response('{}', { status: 404 });
  if (url.endsWith(':runQuery')) {
    return new Response(JSON.stringify(top.map((score, i) => ({ document: {
      name: 'projects/p/databases/(default)/documents/leaderboard_hard/other' + i,
      fields: { score: { integerValue: String(score) } },
    } }))));
  }
  if (init.method === 'PATCH' || init.method === 'POST') {
    writes.push({ path: url.replace(/^.*\/documents/, ''), fields: JSON.parse(init.body).fields });
    return new Response('{}');
  }
  throw new Error('unexpected ' + url);
};

const { default: finish } = await import('../api/run/finish.js');
const { makeRunToken } = await import('../api/_lib/run-token.js');
const { forgetAll } = await import('../api/_lib/rate-limit.js');

function idToken() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
  const body = b64(JSON.stringify({ aud: 'the-rise-of-freny', iss: 'https://securetoken.google.com/the-rise-of-freny',
    sub: 'u1', iat: now, exp: now + 3600, firebase: { sign_in_provider: 'password' } }));
  const sign = createSign('RSA-SHA256');
  sign.update(head + '.' + body);
  return head + '.' + body + '.' + sign.sign(privateKey, 'base64url');
}

const REPLAY = 'H4sI' + 'A'.repeat(2_000_000);   // two parts
async function send(extra = {}) {
  forgetAll();
  writes = [];
  const token = await makeRunToken(process.env.SCORE_KEY, 'u1', 'leaderboard_hard', Date.now() - 60000);
  return finish(new Request('http://x/api/run/finish', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + idToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, board: 'leaderboard_hard', score: 0, gameTime: 30, kills: [], replay: REPLAY, ...extra }),
  }));
}
const paths = () => writes.map((w) => w.path);

test('a record that makes the top keeps its replay, in parts, linked from its log', async () => {
  top = [];
  const res = await send();
  assert.equal(res.status, 200);
  const id = '/replays/u1__leaderboard_hard__0';
  assert.deepEqual(paths().filter((p) => p.startsWith('/replays')), [id + '/partes/0', id + '/partes/1', id + '/partes/2', id + '/partes/log', id]);
  const meta = writes.find((w) => w.path === id).fields;
  assert.equal(meta.parts.integerValue, '3');
  const log = writes.find((w) => w.path === '/runlogs').fields;
  assert.equal(log.replay.stringValue, 'u1__leaderboard_hard__0');
  assert.ok(!('replay' in writes.find((w) => w.path === id + '/partes/log').fields) && !JSON.stringify(log).includes('AAAAAAAAAA'));
});

test('a record below the top 10 keeps no replay', async () => {
  top = [1100, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 150];
  const res = await send({ score: 100, kills: [[1, 'Bug_Enemy', 0]] });
  assert.equal(res.status, 200);
  assert.equal(paths().filter((p) => p.startsWith('/replays')).length, 0);
  assert.ok(!('replay' in writes.find((w) => w.path === '/runlogs').fields));
});

test('a record held for review keeps its replay, and the review entry points to it', async () => {
  top = [10];
  const res = await send({ score: 100, kills: [[1, 'Bug_Enemy', 0]] });
  assert.equal(res.status, 202);
  const pending = writes.find((w) => w.path.startsWith('/pending/')).fields;
  assert.equal(pending.replay.stringValue, 'u1__leaderboard_hard__100');
  assert.ok(paths().includes('/replays/u1__leaderboard_hard__100'));
});

test('an old game without a replay still saves its record', async () => {
  top = [];
  const res = await send({ replay: undefined });
  assert.equal(res.status, 200);
  assert.equal(paths().filter((p) => p.startsWith('/replays')).length, 0);
});
