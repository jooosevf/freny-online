import { BOARDS } from '../_lib/rules.js';
import { json, readRequest, scoreKey } from '../_lib/http.js';
import { makeRunToken } from '../_lib/run-token.js';

export const config = { runtime: 'edge' };

// The game calls this when a manual Arena run starts: { board } -> { token }.
export default async function handler(request) {
  const key = scoreKey();
  if (!key) return json(503, { error: 'SCORE_KEY não configurada' });
  const req = await readRequest(request);
  if (req.error) return req.error;
  if (!BOARDS.includes(req.body.board)) return json(400, { error: 'ranking desconhecido' });
  return json(200, { token: await makeRunToken(key, req.uid, req.body.board, Date.now()) });
}
