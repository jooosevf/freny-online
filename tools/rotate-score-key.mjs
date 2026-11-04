// Re-signs what the Firestore rules check again later, for a new SCORE_KEY. Without it, changing the
// key breaks every public profile and every player's Conquistas (the rules re-check their old
// signatures on each write). The daily boards stay: a new score there comes with a new signature.
//
//   FIREBASE_SERVICE_ACCOUNT='<json>' NEW_SCORE_KEY=<key> node tools/rotate-score-key.mjs           counts only
//   FIREBASE_SERVICE_ACCOUNT='<json>' NEW_SCORE_KEY=<key> node tools/rotate-score-key.mjs --apply   writes
//
// A valid signature made with a leaked key looks like any other: look at the top of each board
// (printed below) before --apply, because what is re-signed stays. Then, together: publish the rules
// with the new key and set SCORE_KEY on Vercel. See docs/firebase/SETUP.md in theRiseOfFreny.
import { pathToFileURL } from 'node:url';
import { sha256Hex } from '../api/_lib/crypto.js';
import { MANUAL_BOARDS, AUTO_BOARDS } from '../api/_lib/rules.js';
import { ACHIEVEMENTS } from '../api/_lib/achievements.js';
import { listAll, patchFields } from '../api/_lib/admin-db.js';

// the fields achievements/{uid} signs: "combo5" was replaced, but old documents still have it
const ACH_FIELDS = ['played', 'combo5', ...ACHIEVEMENTS];
const PERFIL_BOARDS = { Easy: 'leaderboard_easy', Medium: 'leaderboard_medium', Hard: 'leaderboard_hard' };

export async function boardFields(key, board, doc) {
  return Number.isInteger(doc.score) ? { sig: await sha256Hex(`${key}|${doc.id}|${board}|${doc.score}`) } : null;
}

export async function perfilFields(key, doc) {
  const out = {};
  for (const [level, board] of Object.entries(PERFIL_BOARDS)) {
    if (doc['best' + level] > 0) out['sig' + level] = await sha256Hex(`${key}|${doc.id}|${board}|${doc['best' + level]}`);
  }
  return Object.keys(out).length ? out : null;
}

export async function achievementFields(key, doc) {
  const out = {};
  for (const id of ACH_FIELDS) {
    if (id in doc) out[id] = await sha256Hex(`${key}|${doc.id}|ach|${id}`);
  }
  return Object.keys(out).length ? out : null;
}

async function main() {
  const key = process.env.NEW_SCORE_KEY || '';
  if (key.length < 32) throw new Error('NEW_SCORE_KEY precisa de pelo menos 32 caracteres');
  const apply = process.argv.includes('--apply');

  async function each(collection, fieldsOf) {
    const docs = await listAll(collection);
    let changed = 0;
    for (const doc of docs) {
      const fields = await fieldsOf(doc);
      if (!fields) continue;
      changed++;
      if (apply) await patchFields(`${collection}/${doc.id}`, fields);
    }
    console.log(`${collection}: ${changed} de ${docs.length}`);
    return docs;
  }

  for (const board of [...MANUAL_BOARDS, ...AUTO_BOARDS]) {
    const docs = await each(board, (d) => boardFields(key, board, d));
    const top = docs.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);
    for (const d of top) console.log(`  ${d.score}  ${d.name}  ${d.id}`);
  }
  await each('perfis', (d) => perfilFields(key, d));
  await each('achievements', (d) => achievementFields(key, d));
  console.log(apply ? 'Pronto. Agora publique as regras e troque a SCORE_KEY, juntos.' : 'Nada foi escrito (use --apply).');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
