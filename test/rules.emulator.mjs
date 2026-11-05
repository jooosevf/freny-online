// Checks firebase/firestore.rules against the Firebase emulators (not part of npm test: it needs
// them running): SCORE_KEY=... node test/rules.emulator.mjs, with the same key in the loaded rules.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:';
const DOCS = 'http://127.0.0.1:8080/v1/projects/the-rise-of-freny/databases/(default)/documents';
const KEY = process.env.SCORE_KEY;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const rnd = () => crypto.randomBytes(3).toString('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signUp(body) {
  const r = await fetch(AUTH + 'signUp?key=x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true, ...body }) });
  const j = await r.json();
  assert.ok(r.ok, JSON.stringify(j));
  return { uid: j.localId, token: j.idToken };
}
const account = () => signUp({ email: `t${rnd()}@example.com`, password: 'segredo1' });
const guest = () => signUp({});

const val = (v) => (typeof v === 'number' ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: v });

const NAME = 'projects/the-rise-of-freny/databases/(default)/documents/';
function upd(path, data, opts = {}) {
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, val(v)]));
  const w = {
    update: { name: NAME + path, fields },
    updateMask: { fieldPaths: Object.keys(fields) },
    updateTransforms: (opts.times || []).map((t) => ({ fieldPath: t, setToServerValue: 'REQUEST_TIME' })),
  };
  if (opts.isNew) w.currentDocument = { exists: false };
  return w;
}
const delw = (path) => ({ delete: NAME + path });
// several writes in one commit, all or nothing (a nickname goes with the profile that shows it)
async function commit(who, writes) {
  const r = await fetch(DOCS + ':commit', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + who.token }, body: JSON.stringify({ writes }) });
  return r.status;
}
const write = (who, path, data, opts = {}) => commit(who, [upd(path, data, opts)]);
const read = async (who, path) => (await fetch(DOCS + '/' + path, { headers: who ? { Authorization: 'Bearer ' + who.token } : {} })).status;
const del = async (who, path) => (await fetch(DOCS + '/' + path, { method: 'DELETE', headers: { Authorization: 'Bearer ' + who.token } })).status;

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push('ok   ' + name);
  } catch (e) {
    results.push('FAIL ' + name + ': ' + e.message.split('\n')[0]);
    process.exitCode = 1;
  }
}

const ALL_STATS = {};
for (const k of ['runsManual', 'runsAuto', 'secManual', 'secAuto', 'longestRun', 'kills', 'killsAuto', 'deaths', 'bestCombo', 'nights', 'bloodMoons', 'coinsEarned', 'coinsSpent', 'chests',
  'k_bug', 'k_bat', 'k_licker', 'k_golem', 'k_golemRed', 'k_shield', 'k_sorcerer', 'k_supreme', 'k_cyclops', 'k_other',
  'w_sword', 'w_greatsword', 'w_fury', 'w_gun', 'w_shotgun', 'w_grenade', 'w_staff', 'w_other',
  'd_bug', 'd_bat', 'd_licker', 'd_golem', 'd_golemRed', 'd_shield', 'd_sorcerer', 'd_supreme', 'd_cyclops', 'd_fall', 'd_grenade', 'd_mine', 'd_spike', 'd_vomit', 'd_beam', 'd_shock', 'd_acid', 'd_other',
  'runsEasy', 'runsMedium', 'runsHard', 'bestEasy', 'bestMedium', 'bestHard', 'bestAutoEasy', 'bestAutoMedium', 'bestAutoHard']) ALL_STATS[k] = 5;

const STAMP = { times: ['criadoEm'] };
const perfil = (nick, code, extra = {}) => ({
  apelido: nick, chave: nick, codigo: code, helmet: '', cape: '', color: '', suit: '', rebirths: 0,
  bestEasy: 0, bestMedium: 0, bestHard: 0, sigEasy: '', sigMedium: '', sigHard: '',
  runsManual: 1, runsAuto: 0, secManual: 1, secAuto: 0, longestRun: 1, kills: 1, deaths: 1, bestCombo: 10,
  k_cyclops: 0, k_supreme: 0, nights: 0, bloodMoons: 0, chests: 0, coinsEarned: 0, ...extra,
});
const SEEN = { times: ['lastSeen'] };

const a = await account(), b = await account(), c = await account(), g = await guest();
const nickA = 'a' + rnd(), nickB = 'b' + rnd();

await check('a guest cannot take a nickname', async () => assert.equal(await write(g, 'apelidos/g' + rnd(), { uid: g.uid, apelido: 'guest' }, STAMP), 403));
// the game's ProfileService.NickKey: lowercase, accents off
const keyOf = (nick) => nick.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const takeNick = (who, nick, code = '', extra = []) => commit(who, [
  upd('apelidos/' + keyOf(nick), { uid: who.uid, apelido: nick }, { ...STAMP, isNew: true }),
  upd('perfis/' + who.uid, perfil(nick, code, { chave: keyOf(nick) }), SEEN), ...extra]);
await check('a nickname alone, without the profile showing it, is refused', async () =>
  assert.equal(await write(c, 'apelidos/c' + rnd(), { uid: c.uid, apelido: 'cccc' }, STAMP), 403));
await check('an account takes a free nickname, with its profile', async () => assert.equal(await takeNick(a, nickA), 200));
await check('nobody takes it again', async () => assert.notEqual(await write(b, 'apelidos/' + nickA, { uid: b.uid, apelido: nickA }, { ...STAMP, isNew: true }), 200));
await check('not even overwriting without the new-only flag', async () => assert.equal(await write(b, 'apelidos/' + nickA, { uid: b.uid, apelido: nickA }, STAMP), 403));
await check('a nickname in another account\'s name is refused', async () => assert.equal(await write(b, 'apelidos/x' + rnd(), { uid: a.uid, apelido: 'xxx' }, STAMP), 403));
await check('uppercase ids are refused', async () => assert.equal(await write(b, 'apelidos/ABC' + rnd(), { uid: b.uid, apelido: 'ABCD' }, STAMP), 403));
await check('anyone reads a nickname', async () => assert.equal(await read(null, 'apelidos/' + nickA), 200));
await check('only the owner frees it', async () => assert.equal(await del(b, 'apelidos/' + nickA), 403));

const codeA = 'FRENY-' + 'ABCD'.replace(/./g, () => '23456789ABCDEFGHJKMNPQRSTUVWXYZ'[crypto.randomInt(31)]);
await check('friend code: bad shape refused', async () => assert.equal(await write(a, 'codigos/FRENY-0OI1', { uid: a.uid }, STAMP), 403));
await check('profile: a name that is not the nickname\'s is refused', async () =>
  assert.equal(await write(c, 'perfis/' + c.uid, perfil('Overrated', '', { chave: nickA }), SEEN), 403));
const accented = 'Jösé' + rnd().slice(0, 4);
await check('profile: an accented nickname folds to its key', async () => assert.equal(await takeNick(c, accented), 200));
await check('profile: counters beyond the clock are refused', async () =>
  assert.equal(await commit(b, [upd('perfis/' + b.uid, perfil(nickB, '', { kills: 10000000 }), SEEN)]), 403));
await sleep(10500);
const nickA2 = 'a' + rnd();
await check('a second nickname while keeping the first is refused', async () => assert.equal(await takeNick(a, nickA2), 403));
await check('renaming frees the old nickname in the same commit', async () =>
  assert.equal(await takeNick(a, nickA2, '', [delw('apelidos/' + nickA)]), 200));
await check('a code alone, without the profile showing it, is refused', async () =>
  assert.equal(await write(b, 'codigos/FRENY-' + 'ZZZZ'.replace(/./g, () => '23456789ABCDEFGHJKMNPQRSTUVWXYZ'[crypto.randomInt(31)]), { uid: b.uid }, STAMP), 403));
await sleep(10500);
await check('friend code: created, with its profile', async () => assert.equal(await commit(a, [
  upd('codigos/' + codeA, { uid: a.uid }, { ...STAMP, isNew: true }), upd('perfis/' + a.uid, perfil(nickA2, codeA), SEEN)]), 200));
await sleep(10500);
const codeA2 = 'FRENY-' + 'ABCD'.replace(/./g, () => '23456789ABCDEFGHJKMNPQRSTUVWXYZ'[crypto.randomInt(31)]);
await check('friend code: a second one is refused', async () => assert.equal(await commit(a, [
  upd('codigos/' + codeA2, { uid: a.uid }, { ...STAMP, isNew: true }), upd('perfis/' + a.uid, perfil(nickA2, codeA2), SEEN)]), 403));
await check('friend code: cannot be deleted', async () => assert.equal(await del(a, 'codigos/' + codeA), 403));

await check('stats: every field at once fits the rules limits', async () => assert.equal(await write(a, 'stats/' + a.uid, ALL_STATS, { times: ['lastSeen', 'createdAt'] }), 200));
await check('stats: private', async () => { assert.equal(await read(b, 'stats/' + a.uid), 403); assert.equal(await read(a, 'stats/' + a.uid), 200); });
await check('stats: another account cannot write', async () => assert.equal(await write(b, 'stats/' + a.uid, { kills: 9 }, SEEN), 403));
await check('stats: a guest has them too', async () => assert.equal(await write(g, 'stats/' + g.uid, { kills: 1 }, { times: ['lastSeen', 'createdAt'] }), 200));
await check('stats: under 20 s is refused', async () => assert.equal(await write(a, 'stats/' + a.uid, { kills: 6 }, SEEN), 403));
await check('stats: an unknown field is refused', async () => assert.equal(await write(c, 'stats/' + c.uid, { hack: 1 }, { times: ['lastSeen', 'createdAt'] }), 403));

await check('perfil: a nickname not owned is refused', async () => assert.equal(await write(b, 'perfis/' + b.uid, perfil(nickA, ''), SEEN), 403));
await check('perfil: a guest has none', async () => assert.equal(await write(g, 'perfis/' + g.uid, perfil('gggg', ''), SEEN), 403));
await check('perfil: an edited best without its signature is refused', async () =>
  assert.equal(await takeNick(b, nickB, '', [upd('perfis/' + b.uid, perfil(nickB, '', { bestHard: 999999, sigHard: 'forged' }), SEEN)]), 403));
await check('perfil: a code of someone else is refused', async () => assert.equal(await takeNick(b, nickB, codeA), 403));
const sig = sha(`${KEY}|${b.uid}|leaderboard_hard|12345`);
await check('perfil: a best with the API signature goes', async () =>
  assert.equal(await takeNick(b, nickB, '', [upd('perfis/' + b.uid, perfil(nickB, '', { bestHard: 12345, sigHard: sig }), SEEN)]), 200));
await sleep(10500);
// the heaviest commit the game sends: a rename with all three signed bests (the rules' 1000-expression budget)
const nickB2 = 'b' + rnd();
const bests = { bestEasy: 111, bestMedium: 222, bestHard: 12345,
  sigEasy: sha(`${KEY}|${b.uid}|leaderboard_easy|111`), sigMedium: sha(`${KEY}|${b.uid}|leaderboard_medium|222`), sigHard: sig };
await check('perfil: a rename with three signed bests fits the rules\' budget', async () =>
  assert.equal(await takeNick(b, nickB2, '', [upd('perfis/' + b.uid, perfil(nickB2, '', bests), SEEN), delw('apelidos/' + nickB)]), 200));
await check('perfil: under 10 s is refused', async () => assert.equal(await write(b, 'perfis/' + b.uid, perfil(nickB2, '', bests), SEEN), 403));
await check('perfil: public read, no login', async () => assert.equal(await read(null, 'perfis/' + b.uid), 200));
await check('perfil: an email field is refused', async () => assert.equal(await write(a, 'perfis/' + a.uid, perfil(nickA, codeA, { email: 'x@y.z' }), SEEN), 403));

const list = (l, novo = '') => ({ lista: l, novo });
const NOW = { times: ['updatedAt'] };
const pedido = (de, para, tipo = 'pedido') => ({ de: de.uid, para: para.uid, tipo, apelido: 'nome' });

await check('friends: nobody adds someone who did not ask', async () => assert.equal(await write(a, 'amigos/' + a.uid, list([b.uid], b.uid), NOW), 403));
await check('friends: adding without naming "novo" is refused', async () => assert.equal(await write(a, 'amigos/' + a.uid, list([b.uid]), NOW), 403));
await check('pedido: a guest cannot send', async () => assert.equal(await write(g, `pedidos/${a.uid}_${g.uid}`, pedido(g, a), STAMP), 403));
await check('pedido: not in someone else\'s name', async () => assert.equal(await write(c, `pedidos/${a.uid}_${b.uid}`, pedido(b, a), STAMP), 403));
await check('pedido: "aceito" without really listing is refused', async () => assert.equal(await write(b, `pedidos/${a.uid}_${b.uid}`, pedido(b, a, 'aceito'), STAMP), 403));
await check('pedido: b asks a', async () => assert.equal(await write(b, `pedidos/${a.uid}_${b.uid}`, pedido(b, a), { ...STAMP, isNew: true }), 200));
await check('pedido: only the two read it', async () => {
  assert.equal(await read(c, `pedidos/${a.uid}_${b.uid}`), 403);
  assert.equal(await read(a, `pedidos/${a.uid}_${b.uid}`), 200);
});
await check('pedido: cannot be edited', async () => assert.equal(await write(b, `pedidos/${a.uid}_${b.uid}`, pedido(b, a, 'aceito'), STAMP), 403));
await check('pedido: a stranger cannot delete it', async () => assert.equal(await del(c, `pedidos/${a.uid}_${b.uid}`), 403));
await check('pedido: listing only what is addressed to me', async () => {
  const q = (para) => fetch(DOCS + ':runQuery', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.token },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'pedidos' }], where: { fieldFilter: { field: { fieldPath: 'para' }, op: 'EQUAL', value: { stringValue: para } } } } }) });
  assert.equal((await q(a.uid)).status, 200);
  assert.equal((await q(c.uid)).status, 403);
});
await check('friends: the asked one can add who asked', async () => assert.equal(await write(a, 'amigos/' + a.uid, list([b.uid], b.uid), NOW), 200));
await check('pedido: a answers "aceito" now that it lists b', async () => assert.equal(await write(a, `pedidos/${b.uid}_${a.uid}`, pedido(a, b, 'aceito'), STAMP), 200));
await check('friends: b adds a, who lists b', async () => assert.equal(await write(b, 'amigos/' + b.uid, list([a.uid], a.uid), NOW), 200));
await check('friends: c cannot add a', async () => assert.equal(await write(c, 'amigos/' + c.uid, list([a.uid], a.uid), NOW), 403));
await check('friends: private list', async () => assert.equal(await read(c, 'amigos/' + a.uid), 403));
await check('friends: removing needs no permission', async () => assert.equal(await write(a, 'amigos/' + a.uid, list([]), NOW), 200));
await check('friends: nobody lists themselves', async () => assert.equal(await write(c, 'amigos/' + c.uid, list([c.uid], c.uid), NOW), 403));
await check('friends: 51 is too many', async () => {
  const many = Array.from({ length: 51 }, (_, i) => 'u' + i);
  assert.equal(await write(c, 'amigos/' + c.uid, list(many), NOW), 403);
});

const cheater = await account();
const entry = (who, score) => ({ name: 'Trapaça', score, sig: sha(`${KEY}|${who.uid}|leaderboard_hard|${score}`) });
const achSigOf = (who, id) => sha(`${KEY}|${who.uid}|ach|${id}`);
await check('ban: before it, a signed score goes', async () =>
  assert.equal(await write(cheater, 'leaderboard_hard/' + cheater.uid, entry(cheater, 500), NOW), 200));
await write({ token: 'owner' }, 'bans/' + cheater.uid, { reason: 'teste' });
await write({ token: 'owner' }, 'leaderboard_hard/' + cheater.uid, { name: 'x' });
await del({ token: 'owner' }, 'leaderboard_hard/' + cheater.uid);
await check('ban: the same signature cannot bring the entry back', async () =>
  assert.equal(await write(cheater, 'leaderboard_hard/' + cheater.uid, entry(cheater, 500), NOW), 403));
await check('ban: a signed achievement is refused', async () =>
  assert.equal(await write(cheater, 'achievements/' + cheater.uid, { played: achSigOf(cheater, 'played') }, NOW), 403));
await del({ token: 'owner' }, 'bans/' + cheater.uid);
await check('ban: lifted, the signature works again', async () =>
  assert.equal(await write(cheater, 'leaderboard_hard/' + cheater.uid, entry(cheater, 500), NOW), 200));

await sleep(21000);
await check('stats: after 20 s it goes', async () => assert.equal(await write(a, 'stats/' + a.uid, { kills: 6 }, SEEN), 200));
await sleep(100);
await check('stats: a counter cannot go down', async () => {
  await sleep(21000);
  assert.equal(await write(a, 'stats/' + a.uid, { kills: 2 }, SEEN), 403);
});
await check('stats: createdAt never changes', async () => assert.equal(await write(a, 'stats/' + a.uid, { kills: 7 }, { times: ['lastSeen', 'createdAt'] }), 403));

console.log(results.join('\n'));
