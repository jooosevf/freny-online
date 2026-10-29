import { json, readRequest, scoreKey } from '../_lib/http.js';
import { readRunToken } from '../_lib/run-token.js';
import { sha256Hex } from '../_lib/crypto.js';
import { validateRun } from '../_lib/validate.js';
import { earnedAchievements } from '../_lib/achievements.js';

export const config = { runtime: 'edge' };

// The game calls this at the end of a manual Arena run that earned a Conquista (or the player's
// first one): the same body as /api/run/finish plus "events". A run that adds up gets
// { earned: [{ id, sig }] } with sig = sha256("<key>|uid|ach|<id>"), what firestore.rules asks
// for in achievements/{uid}; "played" comes with every accepted run, so the site can count players.
export default async function handler(request) {
  const req = await readRequest(request);
  if (req.error) return req.error;
  const key = scoreKey();
  if (!key) return json(503, { error: 'SCORE_KEY não configurada' });
  const run = req.body;

  const ticket = await readRunToken(key, run.token);
  if (!ticket || ticket.uid !== req.uid) return json(403, { error: 'partida sem ticket válido' });
  if (ticket.board !== run.board) return json(403, { error: 'ticket de outro ranking' });

  const reason = validateRun(run, (Date.now() - ticket.startedAt) / 1000);
  if (reason) {
    console.log(`achievements refused ${req.uid}: ${reason}`);
    return json(422, { error: reason });
  }
  const ids = ['played', ...earnedAchievements(run)];
  const earned = await Promise.all(ids.map(async (id) => ({ id, sig: await sha256Hex(key + '|' + req.uid + '|ach|' + id) })));
  console.log(`achievements ${req.uid}: ${ids.join(' ')}`);
  return json(200, { earned });
}
