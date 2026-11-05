import { json } from '../_lib/http.js';
import { readAdmin } from '../_lib/admin-http.js';
import { searchPlayers, cleanGift, sendGift, giftHistory, LOOKS, MAX_COINS } from '../_lib/presentes.js';

export const config = { runtime: 'edge' };

// admin.html's Presentes tab: { search: "nick" } finds players, { send: { uid, coins, looks, note } }
// gives one a present, {} lists the looks a present can give and the presents already sent.
export default async function handler(request) {
  const req = await readAdmin(request);
  if (req.error) return req.error;
  const body = req.body;
  if (typeof body.search === 'string') return json(200, { players: await searchPlayers(body.search) });
  if (body.send) {
    const { gift, error } = cleanGift(body.send);
    if (error) return json(400, { error });
    const sent = await sendGift(gift);
    if (sent.error) return json(404, { error: sent.error });
    return json(200, sent);
  }
  return json(200, { looks: LOOKS, maxCoins: MAX_COINS, sent: await giftHistory() });
}
