import { json, readRequest, scoreKey } from '../_lib/http.js';
import { readRunToken } from '../_lib/run-token.js';
import { sha256Hex } from '../_lib/crypto.js';
import { validateRun, dailyBoardOf } from '../_lib/validate.js';

export const config = { runtime: 'edge' };

// The game calls this when a run that beat the player's best (all-time or today's) ends:
// { token, board, score, gameTime, kills } -> { sig, dailyBoard, dailySig }, the signatures the
// Firestore rules ask for on the all-time board and on today's board (daily_<level>_<yyyymmdd>,
// Brasília time, the day the run ended). A run that doesn't add up gets 422 with the reason.
export default async function handler(request) {
  const req = await readRequest(request);
  if (req.error) return req.error;
  const key = scoreKey();
  if (!key) return json(503, { error: 'SCORE_KEY não configurada' });
  const run = req.body;

  const ticket = await readRunToken(key, run.token);
  if (!ticket || ticket.uid !== req.uid) return json(403, { error: 'partida sem ticket válido' });
  if (ticket.board !== run.board) return json(403, { error: 'ticket de outro ranking' });

  const realSeconds = (Date.now() - ticket.startedAt) / 1000;
  const reason = validateRun(run, realSeconds);
  if (reason) {
    console.log(`refused ${req.uid} ${run.board} ${run.score}: ${reason}`);
    return json(422, { error: reason });
  }
  const sign = (board) => sha256Hex(key + '|' + req.uid + '|' + board + '|' + run.score);
  const dailyBoard = dailyBoardOf(run.board, Date.now());
  console.log(`accepted ${req.uid} ${run.board} ${run.score} (${run.kills.length} kills, ${realSeconds.toFixed(0)} s)`);
  return json(200, { sig: await sign(run.board), dailyBoard, dailySig: await sign(dailyBoard) });
}
