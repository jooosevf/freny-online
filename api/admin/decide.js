import { json, scoreKey } from '../_lib/http.js';
import { readAdmin } from '../_lib/admin-http.js';
import { getDoc, setDoc, deleteDoc } from '../_lib/admin-db.js';
import { writeEntry } from '../_lib/review.js';
import { BOARDS } from '../_lib/rules.js';

export const config = { runtime: 'edge' };

// admin.html's buttons:
//   { action: 'approve', id }            a pending run goes to its all-time and daily boards
//   { action: 'reject', id, ban? }       a pending run is dropped (and its account banned)
//   { action: 'remove', board, uid, ban? } an entry leaves a board (and its account is banned)
//   { action: 'unban', uid }
export default async function handler(request) {
  const req = await readAdmin(request);
  if (req.error) return req.error;
  const key = scoreKey();
  if (!key) return json(503, { error: 'SCORE_KEY não configurada' });
  const { action, id, board, uid, ban } = req.body;
  const banUid = async (who, why) => setDoc('bans/' + who, { reason: why, createdAt: new Date() });

  if (action === 'approve' || action === 'reject') {
    const run = typeof id === 'string' && id ? await getDoc('pending/' + id) : null;
    if (!run) return json(404, { error: 'recorde pendente não encontrado' });
    if (action === 'approve') {
      await writeEntry(key, run.uid, run.board, run.name, run.score);
      if (run.dailyBoard) await writeEntry(key, run.uid, run.dailyBoard, run.name, run.score);
    } else if (ban) {
      await banUid(run.uid, `recusado: ${run.score} em ${run.board}`);
    }
    await deleteDoc('pending/' + id);
    console.log(`admin ${action} ${id}${ban ? ' +ban' : ''}`);
    return json(200, { ok: true });
  }
  if (action === 'remove') {
    const valid = BOARDS.includes(board) || /^daily_(hard|freny|medium|easy)_20\d{6}$/.test(board || '');
    if (!valid || typeof uid !== 'string' || !uid) return json(400, { error: 'ranking ou conta inválidos' });
    await deleteDoc(board + '/' + uid);
    if (ban) await banUid(uid, `removido de ${board}`);
    console.log(`admin remove ${board}/${uid}${ban ? ' +ban' : ''}`);
    return json(200, { ok: true });
  }
  if (action === 'unban' && typeof uid === 'string' && uid) {
    await deleteDoc('bans/' + uid);
    return json(200, { ok: true });
  }
  return json(400, { error: 'ação desconhecida' });
}
