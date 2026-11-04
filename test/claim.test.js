import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.SCORE_KEY = 'x'.repeat(32);
process.env.REVIEW_MIN_SCORE = '50';   // a one-kill run can reach review
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
  client_email: 'api@the-rise-of-freny.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
});
const b64 = (x) => Buffer.from(x).toString('base64url');

// Google and Firestore, faked: Firestore only has to answer the ban lookup and the board's top
let banned = false;
let top = [];
globalThis.fetch = async (url, init = {}) => {
  if (url.includes('securetoken')) {
    return new Response(JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }] }),
      { status: 200, headers: { 'cache-control': 'max-age=3600' } });
  }
  if (url === 'https://oauth2.googleapis.com/token') {
    return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
  }
  if (url.includes('/bans/')) return banned ? new Response(JSON.stringify({ fields: {} })) : new Response('{}', { status: 404 });
  if (url.endsWith(':runQuery')) {
    return new Response(JSON.stringify(top.map((score, i) => ({ document: {
      name: 'projects/p/databases/(default)/documents/leaderboard_hard/other' + i,
      fields: { score: { integerValue: String(score) } },
    } }))));
  }
  throw new Error('unexpected ' + url);
};

const { default: handler } = await import('../api/achievements/claim.js');
const { makeRunToken } = await import('../api/_lib/run-token.js');

function idToken() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
  const body = b64(JSON.stringify({ aud: 'the-rise-of-freny', iss: 'https://securetoken.google.com/the-rise-of-freny',
    sub: 'u1', iat: now, exp: now + 3600, firebase: { sign_in_provider: 'password' } }));
  const sign = createSign('RSA-SHA256');
  sign.update(head + '.' + body);
  return head + '.' + body + '.' + sign.sign(privateKey, 'base64url');
}

// a run with no kills adds up to 0 points, so only "score" and "flags" change between the tests
async function claim(extra = {}) {
  const token = await makeRunToken(process.env.SCORE_KEY, 'u1', 'leaderboard_hard', Date.now() - 60000);
  return handler(new Request('http://x/api/achievements/claim', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + idToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, board: 'leaderboard_hard', score: 0, gameTime: 30, kills: [], ...extra }),
  }));
}

test('an accepted run earns "played"', async () => {
  const res = await claim();
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).earned.map((e) => e.id), ['played']);
});

test('a banned account earns nothing', async () => {
  banned = true;
  try {
    assert.equal((await claim()).status, 403);
  } finally {
    banned = false;
  }
});

test('a run the anti-cheat flagged is refused, as the ranking refuses it', async () => {
  const res = await claim({ flags: ['mem'] });
  assert.equal(res.status, 422);
});

test('a score that goes to review earns nothing until it is approved', async () => {
  top = [10];
  try {
    const res = await claim({ score: 100, kills: [[1, 'Bug_Enemy', 0]] });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.earned, []);
    assert.equal(body.pending, true);
  } finally {
    top = [];
  }
});
