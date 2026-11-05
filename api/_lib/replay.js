import { getDoc, setDoc } from './admin-db.js';

// The run's replay (the game's RunRecorder: where Freny and the enemies were, ten times a second,
// gzipped, in base64), so the ADMs can watch a record before it counts (José, 2026-11-05). Only a
// run that goes to review or into a board's top is kept: replays/{id} with what it is, its text in
// replays/{id}/partes/{0..n} (a Firestore document holds 1 MiB), and the run's kills and life log
// in replays/{id}/partes/log, which the viewer lays over the replay.
export const MAX_REPLAY_CHARS = 4_000_000;
const PART_CHARS = 900_000;

// the replay the game sent, or null when it's missing, too big or not base64
export function replayOf(run) {
  const r = run && run.replay;
  if (typeof r !== 'string' || r.length < 16 || r.length > MAX_REPLAY_CHARS) return null;
  return /^[A-Za-z0-9+/]+=*$/.test(r) ? r : null;
}

// one per account, board and score: the same record sent again overwrites it
export function replayId(uid, board, score) {
  const clean = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return clean(uid) + '__' + clean(board) + '__' + (Number(score) || 0);
}

export async function saveReplay(uid, run, realSeconds) {
  const text = replayOf(run);
  if (!text) return null;
  const id = replayId(uid, run.board, run.score);
  const parts = Math.ceil(text.length / PART_CHARS);
  for (let i = 0; i < parts; i++) {
    await setDoc(`replays/${id}/partes/${i}`, { data: text.slice(i * PART_CHARS, (i + 1) * PART_CHARS) });
  }
  const cut = (list, max) => JSON.stringify(Array.isArray(list) ? list : []).slice(0, max);
  await setDoc(`replays/${id}/partes/log`, { kills: cut(run.kills, 700_000), vitals: cut(run.vitals, 200_000) });
  await setDoc('replays/' + id, {
    uid, board: String(run.board).slice(0, 40), score: Number(run.score) || 0, parts, chars: text.length,
    gameTime: Number(run.gameTime) || 0, realSeconds, createdAt: new Date(),
  });
  return id;
}

// the replay's text back, for admin.html (null when there is none)
export async function loadReplay(id) {
  const meta = await getDoc('replays/' + id);
  if (!meta) return null;
  let text = '';
  for (let i = 0; i < meta.parts; i++) {
    const part = await getDoc(`replays/${id}/partes/${i}`);
    if (!part) return null;
    text += part.data;
  }
  const log = await getDoc(`replays/${id}/partes/log`);
  const parse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return [];   // cut short
    }
  };
  return { meta, text, kills: parse(log?.kills || '[]'), vitals: parse(log?.vitals || '[]') };
}
