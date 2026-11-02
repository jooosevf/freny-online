// Freny's life over a run, which the game logs since the anti-cheat update (Player.Vital):
//   vitals: [[game seconds, kind, n], ...]
//     "max" n   max health is now n (first entry, and again when a heart is bought mid-run)
//     "life" n  his hearts when the log started (second entry)
//     "hit" n   n points of damage, the armor takes them first · "fall" n  n points off his life
//     "heal" n  n hearts back · "armor" n  armor set to n (the Berserker helmet)
//   flags: what the game itself noticed ("mem" = a value edited in memory, "speed" = its clock
//     running at another speed than the computer's)
// Cheat Engine's "infinite life" freezes the hearts in memory, but the game still logs every hit:
// replaying them here, his hearts run out while the run goes on. A run that never takes a hit is
// possible but rare, so it goes to José's review instead of being refused.

export const BASE_MAX_HEALTH = 4;          // Player.MaxHealth in "ZE Arena.unity"
export const MAX_HEALTH = BASE_MAX_HEALTH + 4 + 1;   // + FrenyProgress MaxHealth upgrade, 4 levels, + the Coração extra blessing
export const ARMOR_MAX = 3;                // Player.ArmorMax
const MAX_HIT = 10;
const DEATH_SLACK = 2;                     // game seconds between the last hit and the run's end
export const FLAWLESS_SECONDS = 240;       // this long without a hit is worth a look

// -> { reason } refuses the run, { suspect } sends it to review, {} is fine
export function checkVitals(run, { required = false } = {}) {
  const { vitals, flags, gameTime } = run;
  if (flags !== undefined) {
    if (!Array.isArray(flags) || flags.some((f) => typeof f !== 'string')) return { reason: 'registro inválido' };
    if (flags.length) return { reason: `partida adulterada (${flags.slice(0, 4).join(', ').slice(0, 40)})` };
  }
  if (vitals === undefined) return required ? { reason: 'versão antiga do jogo, recarregue a página' } : {};
  if (!Array.isArray(vitals) || vitals.length > 100000) return { reason: 'registro de vida inválido' };

  let max = 0;
  let life = 0;
  let armor = 0;
  let hurt = 0;
  let prevT = 0;
  let diedAt = null;
  for (let i = 0; i < vitals.length; i++) {
    const v = vitals[i];
    if (!Array.isArray(v) || v.length !== 3) return { reason: `vida ${i} inválida` };
    const [t, kind, n] = v;
    if (typeof t !== 'number' || !(t >= 0) || t < prevT || t > gameTime + 1) return { reason: `vida ${i} fora de ordem` };
    if (!Number.isInteger(n) || n < 0) return { reason: `vida ${i} inválida` };
    if (diedAt !== null) return { reason: `Freny morreu aos ${diedAt.toFixed(1)} s e continuou jogando` };
    if (i === 0 && kind !== 'max') return { reason: 'registro de vida sem o começo' };
    if (i === 1 && kind !== 'life') return { reason: 'registro de vida sem o começo' };
    switch (kind) {
      case 'max':
        if (n < BASE_MAX_HEALTH || n > MAX_HEALTH) return { reason: `vida máxima ${n} impossível` };
        if (i > 0 && n > max) life += n - max;   // a bought heart arrives full
        max = n;
        life = Math.min(life, max);
        break;
      case 'life':
        if (i !== 1 || n < 1 || n > max) return { reason: 'vida inicial impossível' };
        life = n;
        break;
      case 'hit':
      case 'fall': {
        if (n < 1 || n > MAX_HIT) return { reason: `dano ${n} impossível` };
        const toArmor = kind === 'hit' ? Math.min(armor, n) : 0;
        armor -= toArmor;
        life -= n - toArmor;
        hurt++;
        break;
      }
      case 'heal':
        if (n < 1 || n > max) return { reason: `cura ${n} impossível` };
        life = Math.min(life + n, max);
        break;
      case 'armor':
        if (n > ARMOR_MAX) return { reason: `armadura ${n} impossível` };
        armor = n;
        break;
      default:
        return { reason: `vida ${i} inválida` };
    }
    if (i > 0 && life <= 0) diedAt = t;
    prevT = t;
  }
  if (vitals.length < 2) return { reason: 'registro de vida sem o começo' };
  if (diedAt !== null && gameTime > diedAt + DEATH_SLACK) {
    return { reason: `Freny morreu aos ${diedAt.toFixed(1)} s e continuou jogando` };
  }
  if (hurt === 0 && gameTime >= FLAWLESS_SECONDS) {
    return { suspect: `${Math.round(gameTime / 60)} min sem levar dano` };
  }
  return {};
}
