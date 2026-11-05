import { json } from '../_lib/http.js';
import { readAdmin } from '../_lib/admin-http.js';
import { listDocs } from '../_lib/admin-db.js';
import { BOARDS } from '../_lib/rules.js';
import { dailyBoardOf } from '../_lib/validate.js';

export const config = { runtime: 'edge' };

// admin.html: the runs waiting for review, the banned accounts, the newest feedback, the top of every board
// (all-time and today's), and which runs have a replay to watch (the Replay tab).
export default async function handler(request) {
  const req = await readAdmin(request);
  if (req.error) return req.error;
  const boards = {};
  for (const board of BOARDS) {
    boards[board] = await listDocs(board, 'score', 15);
    const daily = dailyBoardOf(board, Date.now());
    if (daily) boards[daily] = await listDocs(daily, 'score', 15);
  }
  return json(200, {
    pending: await listDocs('pending', 'score', 100),
    bans: await listDocs('bans', null, 200),
    feedback: await listDocs('feedback', 'criadoEm', 100),
    boards,
    replays: (await listDocs('replays', 'createdAt', 300)).map((r) => r.id),
  });
}
