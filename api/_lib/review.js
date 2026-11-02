import { getDoc, setDoc, addDoc, listDocs } from './admin-db.js';
import { sha256Hex } from './crypto.js';

// A score far above the board's best doesn't go straight to the ranking: it waits in pending/
// until José looks at it in admin.html (2026-10-29, after a forged 2.1 million went to the top).
// REVIEW_MIN_SCORE (env, 250 000 by default) and 1.5x the best of anyone else on that board.
export const REVIEW_MIN_SCORE = Number(process.env.REVIEW_MIN_SCORE || 250000);
export const REVIEW_FACTOR = 1.5;
const MAX_LOG_CHARS = 900000;   // a Firestore document holds 1 MiB

export function pendingId(uid, board) {
  return uid + '__' + board;
}

export async function isBanned(uid) {
  return (await getDoc('bans/' + uid)) !== null;
}

export async function needsReview(uid, board, score) {
  if (score < REVIEW_MIN_SCORE) return false;
  const top = await listDocs(board, 'score', 3);
  const best = top.filter((e) => e.id !== uid).reduce((m, e) => Math.max(m, e.score || 0), 0);
  return score > best * REVIEW_FACTOR;
}

// A run the game noticed something odd about (checkVitals' suspect) is reviewed when it would
// make the board's top SUSPECT_TOP, whatever its score.
export const SUSPECT_TOP = 10;

export async function wouldPlace(uid, board, score, top = SUSPECT_TOP) {
  const best = (await listDocs(board, 'score', top + 1)).filter((e) => e.id !== uid);
  return best.length < top || score > (best[top - 1].score || 0);
}

// every run that reaches the server is kept (accepted, sent to review or refused, with the
// reason), with its whole kill and life logs
export async function keepLog(uid, run, realSeconds, status, note = '') {
  const cap = (list) => {
    const text = JSON.stringify(Array.isArray(list) ? list : []);
    return text.length > MAX_LOG_CHARS ? text.slice(0, MAX_LOG_CHARS) : text;
  };
  await addDoc('runlogs', {
    uid, board: String(run.board).slice(0, 40), score: Number(run.score) || 0, name: cleanName(run.name), status,
    note: String(note).slice(0, 200), gameTime: Number(run.gameTime) || 0, realSeconds,
    killCount: Array.isArray(run.kills) ? run.kills.length : 0,
    kills: cap(run.kills), vitals: cap(run.vitals).slice(0, 200000), flags: cap(run.flags).slice(0, 200),
    blessings: cap(run.blessings).slice(0, 400),
    createdAt: new Date(),
  });
}

export async function holdForReview(uid, run, realSeconds, dailyBoard, note = '') {
  const save = await getDoc('saves/' + uid);   // the game keeps the player's name there
  await setDoc('pending/' + pendingId(uid, run.board), {
    uid, board: run.board, dailyBoard, score: run.score, name: cleanName(run.name || save?.playerName),
    gameTime: run.gameTime, realSeconds, killCount: run.kills.length, note, createdAt: new Date(),
  });
}

export function cleanName(name) {
  const n = typeof name === 'string' ? name.trim().slice(0, 16) : '';
  return n || 'Freny';
}

// what the game itself writes for a signed score: only goes up
export async function writeEntry(key, uid, board, name, score) {
  const current = await getDoc(board + '/' + uid);
  if (current && current.score >= score) return;
  await setDoc(board + '/' + uid, {
    name: cleanName(current?.name || name), score,
    sig: await sha256Hex(key + '|' + uid + '|' + board + '|' + score), updatedAt: new Date(),
    // Renascer's star stays on the entry (the rules allow the field, only the game sets it)
    ...(Number.isInteger(current?.rebirths) ? { rebirths: current.rebirths } : {}),
  });
}
