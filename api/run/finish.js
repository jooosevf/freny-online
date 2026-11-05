import { json, readRequest, scoreKey } from '../_lib/http.js';
import { readRunToken } from '../_lib/run-token.js';
import { sha256Hex } from '../_lib/crypto.js';
import { validateRun, dailyBoardOf } from '../_lib/validate.js';
import { hasAdminDb } from '../_lib/admin-db.js';
import { isBanned, needsReview, wouldPlace, keepLog, holdForReview } from '../_lib/review.js';
import { checkVitals } from '../_lib/vitals.js';
import { weeklyMutator } from '../_lib/rules.js';
import { saveReplay } from '../_lib/replay.js';

export const config = { runtime: 'edge' };

// The game calls this when a run that beat the player's best (all-time or today's) ends:
// { token, board, score, gameTime, kills, vitals, flags } -> { sig, dailyBoard, dailySig }, the signatures the
// Firestore rules ask for on the all-time board and on today's board (daily_<level>_<yyyymmdd>,
// Brasília time, the day the run ended). A run that doesn't add up gets 422 with the reason.
// With the service account set (FIREBASE_SERVICE_ACCOUNT), every accepted run's log is kept,
// banned accounts get 403, and a score far above the board's best gets 202 and no signature: it
// waits for José's review in admin.html, which writes it to the boards if he approves it.
// The run's replay ("replay", the game's RunRecorder) is kept for a run held for review or that
// makes the board's top SUSPECT_TOP, so the ADMs can watch it in admin.html (replay.js).
// A guest (anonymous login) gets 403: the ranking is for accounts. The game offers "Criar conta
// para salvar", which keeps the user id, so the same run's ticket is good right after it.
export default async function handler(request) {
  const req = await readRequest(request, 'finish');
  if (req.error) return req.error;
  if (req.anonymous) return json(403, { error: 'crie uma conta para salvar o recorde', needsAccount: true });
  const key = scoreKey();
  if (!key) return json(503, { error: 'SCORE_KEY não configurada' });
  const run = req.body;

  const ticket = await readRunToken(key, run.token);
  if (!ticket || ticket.uid !== req.uid) return json(403, { error: 'partida sem ticket válido' });
  if (ticket.board !== run.board) return json(403, { error: 'ticket de outro ranking' });

  const realSeconds = (Date.now() - ticket.startedAt) / 1000;
  // REQUIRE_VITALS=1 once every build in the wild logs Freny's life (the anti-cheat update)
  const vitals = checkVitals(run, { required: process.env.REQUIRE_VITALS === '1' });
  const reason = validateRun(run, realSeconds) || vitals.reason;
  if (reason) {
    console.log(`refused ${req.uid} ${run.board} ${run.score}: ${reason}`);
    if (hasAdminDb()) await keepLog(req.uid, run, realSeconds, 'refused', reason).catch(() => {});
    return json(422, { error: reason });
  }
  const sign = (board) => sha256Hex(key + '|' + req.uid + '|' + board + '|' + run.score);
  const dailyBoard = dailyBoardOf(run.board, Date.now());
  if (hasAdminDb()) {
    if (await isBanned(req.uid)) {
      console.log(`banned ${req.uid} ${run.board} ${run.score}`);
      return json(403, { error: 'conta bloqueada no ranking' });
    }
    const far = await needsReview(req.uid, run.board, run.score);
    if (far || (vitals.suspect && await wouldPlace(req.uid, run.board, run.score))) {
      const note = far ? 'muito acima do ranking' : vitals.suspect;
      const replay = await saveReplay(req.uid, run, realSeconds).catch(() => null);
      await holdForReview(req.uid, run, realSeconds, dailyBoard, note, replay);
      await keepLog(req.uid, run, realSeconds, 'pending', note, Date.now(), replay);
      console.log(`review ${req.uid} ${run.board} ${run.score} (${note}; ${run.kills.length} kills, ${realSeconds.toFixed(0)} s)`);
      return json(202, { pending: true, error: 'recorde em revisão, entra no ranking quando for aprovado' });
    }
    const top = run.replay && await wouldPlace(req.uid, run.board, run.score).catch(() => false);
    const replay = top ? await saveReplay(req.uid, run, realSeconds).catch(() => null) : null;
    await keepLog(req.uid, run, realSeconds, 'accepted', '', Date.now(), replay);
  }
  // the blessings and the week's mutator change no points (rules.js): only noted, with a warning when
  // the game's week is not the server's (a wrong clock, or a run across Monday 00:00)
  const week = weeklyMutator(ticket.startedAt);
  const mutator = typeof run.mutator === 'string' ? run.mutator.slice(0, 40) : '';
  const blessings = blessingList(run);
  console.log(`accepted ${req.uid} ${run.board} ${run.score} (${run.kills.length} kills, ${realSeconds.toFixed(0)} s` +
    `, blessings ${blessings || '-'}, mutator ${mutator || '-'}${mutator && mutator !== week ? ' (week: ' + week + ')' : ''})`);
  return json(200, { sig: await sign(run.board), dailyBoard, dailySig: dailyBoard ? await sign(dailyBoard) : null });
}

// the run's blessings for the log, "key@seconds": each golden chest adds one, as
// [[gameSeconds,"key"],...]; a game from before that (Alpha 0.0.2) sends just "blessing":"key"
function blessingList(run) {
  if (!Array.isArray(run.blessings)) {
    return typeof run.blessing === 'string' ? run.blessing.slice(0, 40) : '';
  }
  return run.blessings.slice(0, 10)
    .filter((b) => Array.isArray(b) && typeof b[1] === 'string')
    .map((b) => `${b[1].slice(0, 40)}@${Number(b[0]) || 0}`)
    .join(' ');
}
