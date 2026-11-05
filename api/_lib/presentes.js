import { getDoc, setDoc, addDoc, listByPrefix, listDocs } from './admin-db.js';

// Presents José gives players from admin.html (alpha testers): coins and looks. Each one is a
// document presentes/{uid}/itens/{id} that only the server writes and only that player reads and
// deletes (firestore.rules). The game (Online/GiftInbox.cs) reads them when the player signs in,
// adds them to the save slot being played and deletes them. A copy goes to presentesEnviados for
// the admin's history.

export const MAX_COINS = 1_000_000;
export const MAX_NOTE = 140;

// the looks a present can give: the ones FrenyLook keeps in its "bought" list (Coins,
// CoinsAfterAchievement and GoldenChest; Assets/Scripts/Variety/FrenyLook.cs). The achievement and
// Renascer ones follow what the player did, so a present can't give them.
export const LOOKS = {
  'helmet.berserker': 'Capacete Berserker', 'helmet.gold': 'Elmo dourado', 'helmet.ice': 'Elmo de gelo',
  'helmet.viking': 'Elmo viking', 'helmet.cyclops': 'Elmo do Ciclope',
  'cape.red': 'Capa vermelha', 'cape.night': 'Capa noturna', 'cape.gold': 'Capa dourada',
  'color.red': 'Vermelho', 'color.blue': 'Azul', 'color.green': 'Verde', 'color.purple': 'Roxo', 'color.black': 'Preto',
  'suit.berserker': 'Traje Berserker',
};

// the nickname's key, as the game and the rules make it (lower case, no accents)
export function nickKey(nick) {
  return String(nick || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function row(id, p) {
  return { uid: id, apelido: p.apelido || '', codigo: p.codigo || '', lastSeen: p.lastSeen || null, runs: p.runs || 0 };
}

// by nickname (its start), friend code (FRENY-XXXX) or the account id itself
export async function searchPlayers(text) {
  const q = String(text || '').trim();
  if (q.length < 2) return [];
  const found = new Map();
  if (/^FRENY-/i.test(q)) {
    const code = await getDoc('codigos/' + encodeURIComponent(q.toUpperCase()));
    if (code?.uid) {
      const p = await getDoc('perfis/' + code.uid);
      if (p) found.set(code.uid, row(code.uid, p));
    }
  }
  if (/^[A-Za-z0-9]{20,40}$/.test(q)) {
    const p = await getDoc('perfis/' + q);
    if (p) found.set(q, row(q, p));
  }
  const key = nickKey(q);
  if (key) for (const p of await listByPrefix('perfis', 'chave', key, 20)) found.set(p.id, row(p.id, p));
  return [...found.values()];
}

// checks and cleans what admin.html sends: { uid, coins, looks: [ids], note }
export function cleanGift(body) {
  const uid = typeof body?.uid === 'string' && /^[A-Za-z0-9]{10,40}$/.test(body.uid) ? body.uid : null;
  if (!uid) return { error: 'jogador inválido' };
  const coins = Number(body.coins) || 0;
  if (!Number.isInteger(coins) || coins < 0 || coins > MAX_COINS) return { error: `moedas entre 0 e ${MAX_COINS.toLocaleString('pt-BR')}` };
  const looks = [...new Set(Array.isArray(body.looks) ? body.looks : [])];
  if (looks.some((l) => !(l in LOOKS))) return { error: 'visual desconhecido' };
  if (!coins && !looks.length) return { error: 'escolha moedas ou algum visual' };
  const note = String(body.note || '').trim().slice(0, MAX_NOTE);
  return { gift: { uid, coins, looks, note } };
}

export async function sendGift({ uid, coins, looks, note }, now = new Date()) {
  const perfil = await getDoc('perfis/' + uid);
  if (!perfil) return { error: 'esse jogador não tem perfil (nunca escolheu um apelido)' };
  const id = now.getTime().toString(36) + Math.random().toString(36).slice(2, 8);
  const doc = { moedas: coins, visuais: looks.join(','), mensagem: note, criadoEm: now };
  await setDoc(`presentes/${uid}/itens/${id}`, doc);
  await addDoc('presentesEnviados', { ...doc, uid, apelido: perfil.apelido || '', presente: id });
  return { id, apelido: perfil.apelido || '' };
}

export async function giftHistory() {
  return listDocs('presentesEnviados', 'criadoEm', 100);
}
