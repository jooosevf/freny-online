import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import handler from '../api/run/finish.js';

// real RS256 tokens, with Google's keys answered by this fake fetch
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = (x) => Buffer.from(x).toString('base64url');
globalThis.fetch = async () => new Response(JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] }),
  { status: 200, headers: { 'cache-control': 'max-age=3600' } });

function token(provider) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
  const body = b64(JSON.stringify({ aud: 'the-rise-of-freny', iss: 'https://securetoken.google.com/the-rise-of-freny',
    sub: 'u1', iat: now, exp: now + 3600, firebase: { sign_in_provider: provider } }));
  const sign = createSign('RSA-SHA256');
  sign.update(head + '.' + body);
  return head + '.' + body + '.' + sign.sign(privateKey, 'base64url');
}

const finish = (provider) => handler(new Request('http://x/api/run/finish', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token(provider), 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: 'no', board: 'leaderboard_hard', score: 100, gameTime: 1, kills: [] }),
}));

test('a guest does not reach the ranking: 403, and the game knows to offer an account', async () => {
  process.env.SCORE_KEY = 'x'.repeat(32);
  const res = await finish('anonymous');
  assert.equal(res.status, 403);
  assert.equal((await res.json()).needsAccount, true);
});

test('an email account goes on to the usual check of the ticket', async () => {
  process.env.SCORE_KEY = 'x'.repeat(32);
  const res = await finish('password');
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'partida sem ticket válido');
});
