import { json } from '../_lib/http.js';
import { readAdmin } from '../_lib/admin-http.js';
import { loadReplay } from '../_lib/replay.js';
import { getDoc, listDocs } from '../_lib/admin-db.js';

export const config = { runtime: 'edge' };

// admin.html (Replay tab): one replay ({ id }) with the kills and hits kept with it, or with
// { list: true } the newest replays kept.
export default async function handler(request) {
  const req = await readAdmin(request);
  if (req.error) return req.error;
  if (req.body.list) return json(200, { replays: await listDocs('replays', 'createdAt', 100) });
  const id = typeof req.body.id === 'string' ? req.body.id : '';
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(id)) return json(400, { error: 'replay inválido' });
  const found = await loadReplay(id);
  if (!found) return json(404, { error: 'replay não encontrado' });
  const perfil = await getDoc('perfis/' + found.meta.uid).catch(() => null);
  return json(200, { ...found.meta, id, replay: found.text, kills: found.kills, vitals: found.vitals, name: perfil?.apelido || null });
}
