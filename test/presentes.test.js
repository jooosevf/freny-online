import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.ADMIN_TOKEN = 'a'.repeat(20);
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
  client_email: 'api@the-rise-of-freny.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
});

// Firestore, faked: two profiles, one friend code; every write and query is noted
const PERFIS = {
  abcdefghij0123456789: { apelido: 'Zé_Teste', chave: 'ze_teste', codigo: 'FRENY-AB2C', runs: 3 },
  zzzzzzzzzz0123456789: { apelido: 'Zeca', chave: 'zeca', codigo: '' },
};
let writes = [], queries = [];
const doc = (path, obj) => ({ name: 'projects/p/databases/(default)/documents/' + path,
  fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v }])) });
globalThis.fetch = async (url, init = {}) => {
  if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
  const path = url.replace(/^.*\/documents/, '');
  if (path === ':runQuery') {
    const q = JSON.parse(init.body).structuredQuery;
    queries.push(q);
    if (q.from[0].collectionId === 'perfis') {
      const from = q.where.compositeFilter.filters[0].fieldFilter.value.stringValue;
      return new Response(JSON.stringify(Object.entries(PERFIS).filter(([, p]) => p.chave.startsWith(from)).map(([id, p]) => ({ document: doc('perfis/' + id, p) }))));
    }
    return new Response('[]');
  }
  if (!init.method || init.method === 'GET') {
    const m = path.match(/^\/perfis\/(\w+)$/);
    if (m && PERFIS[m[1]]) return new Response(JSON.stringify(doc('perfis/' + m[1], PERFIS[m[1]])));
    if (path === '/codigos/FRENY-AB2C') return new Response(JSON.stringify(doc('codigos/FRENY-AB2C', { uid: 'abcdefghij0123456789' })));
    return new Response('{}', { status: 404 });
  }
  writes.push({ method: init.method, path, fields: JSON.parse(init.body).fields });
  return new Response('{}');
};

const { default: handler } = await import('../api/admin/presentes.js');
const { cleanGift, nickKey } = await import('../api/_lib/presentes.js');

function call(body, token = process.env.ADMIN_TOKEN) {
  writes = []; queries = [];
  return handler(new Request('http://x/api/admin/presentes', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify(body),
  }));
}

test('the key folds case and accents like the game', () => {
  assert.equal(nickKey(' Zé_Teste '), 'ze_teste');
});

test('a present needs a player and coins or a known look, within the limits', () => {
  assert.ok(cleanGift({ uid: 'abcdefghij0123456789', coins: 500 }).gift);
  assert.match(cleanGift({ uid: 'x', coins: 5 }).error, /jogador/);
  assert.match(cleanGift({ uid: 'abcdefghij0123456789' }).error, /escolha/);
  assert.match(cleanGift({ uid: 'abcdefghij0123456789', coins: -1 }).error, /moedas/);
  assert.match(cleanGift({ uid: 'abcdefghij0123456789', coins: 2_000_000 }).error, /moedas/);
  assert.match(cleanGift({ uid: 'abcdefghij0123456789', coins: 1.5 }).error, /moedas/);
  assert.match(cleanGift({ uid: 'abcdefghij0123456789', looks: ['helmet.crown'] }).error, /visual/);
  const { gift } = cleanGift({ uid: 'abcdefghij0123456789', looks: ['cape.red', 'cape.red'], note: 'x'.repeat(300) });
  assert.deepEqual(gift.looks, ['cape.red']);
  assert.equal(gift.note.length, 140);
});

test('the wrong password gets nothing', async () => {
  assert.equal((await call({ search: 'ze' }, 'b'.repeat(20))).status, 401);
});

test('search by the start of the nickname, with or without the accent', async () => {
  const res = await (await call({ search: 'Zé' })).json();
  assert.deepEqual(res.players.map((p) => p.apelido).sort(), ['Zeca', 'Zé_Teste']);
  assert.equal(queries[0].where.compositeFilter.filters[0].fieldFilter.value.stringValue, 'ze');
});

test('search by friend code or account id', async () => {
  assert.deepEqual((await (await call({ search: 'freny-ab2c' })).json()).players.map((p) => p.apelido), ['Zé_Teste']);
  assert.deepEqual((await (await call({ search: 'zzzzzzzzzz0123456789' })).json()).players.map((p) => p.apelido), ['Zeca']);
});

test('sending writes the present for the player and a copy for the history', async () => {
  const res = await call({ send: { uid: 'abcdefghij0123456789', coins: 5000, looks: ['helmet.viking', 'suit.berserker'], note: 'valeu!' } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).apelido, 'Zé_Teste');
  const gift = writes.find((w) => w.path.startsWith('/presentes/abcdefghij0123456789/itens/'));
  assert.ok(gift, 'present written');
  assert.equal(gift.fields.moedas.integerValue, '5000');
  assert.equal(gift.fields.visuais.stringValue, 'helmet.viking,suit.berserker');
  assert.equal(gift.fields.mensagem.stringValue, 'valeu!');
  assert.ok(gift.fields.criadoEm.timestampValue);
  const copy = writes.find((w) => w.path === '/presentesEnviados');
  assert.equal(copy.fields.uid.stringValue, 'abcdefghij0123456789');
  assert.equal(copy.fields.apelido.stringValue, 'Zé_Teste');
});

test('a player without a profile gets no present', async () => {
  const res = await call({ send: { uid: 'nobodynobody0123456789', coins: 10 } });
  assert.equal(res.status, 404);
  assert.equal(writes.length, 0);
});

test('{} lists the looks and the presents sent', async () => {
  const res = await (await call({})).json();
  assert.equal(res.looks['suit.berserker'], 'Traje Berserker');
  assert.ok(Array.isArray(res.sent));
});
