// The Conquistas (theRiseOfFreny's Achievements.cs): which ones an accepted manual Arena run backs
// up. Same keys and numbers as the game; change them together.
// run.kills: [[seconds, prefab, combo step], ...]; run.events: [[seconds, kind, count], ...], the
// moments the kill log alone can't show (the game's Achievements.Happened).

export const ACHIEVEMENTS = ['million', 'cyclops', 'supreme', 'grenade5', 'oops', 'shotgun3', 'backstab', 'eye', 'combo5', 'survivor'];

const MILLION = 1000000;
const GRENADE_KILLS = 5;
const SHOTGUN_KILLS = 3;
const COMBO_STEP = 39;          // the kill at 4.9x shows 5.0x after it
const SURVIVE_SECONDS = 600;
const SAME_FRAME = 0.02;        // a grenade's kills all land in the frame it goes off
const PELLET_SECONDS = 3.05;    // a shotgun pellet lives 3 s

function killsBetween(kills, from, to, name) {
  let n = 0;
  for (const [t, enemy] of kills) {
    if (t >= from && t <= to && (!name || enemy === name)) n++;
  }
  return n;
}

// the keys the run earns, each checked against the kill log
export function earnedAchievements(run) {
  const { score, gameTime, kills } = run;
  const events = Array.isArray(run.events) ? run.events.slice(0, 1000) : [];
  const earned = new Set();
  if (score >= MILLION) earned.add('million');
  if (gameTime >= SURVIVE_SECONDS) earned.add('survivor');
  for (const [, enemy, k] of kills) {
    if (enemy === 'Cyclops_Boss') earned.add('cyclops');
    if (enemy === 'Sorcerer_Supreme') earned.add('supreme');
    if (k >= COMBO_STEP) earned.add('combo5');
  }
  for (const e of events) {
    if (!Array.isArray(e) || typeof e[0] !== 'number' || !(e[0] >= 0) || e[0] > gameTime + 1) continue;
    const [t, kind] = e;
    if (kind === 'grenade' && killsBetween(kills, t - SAME_FRAME, t + SAME_FRAME) >= GRENADE_KILLS) earned.add('grenade5');
    if (kind === 'shotgun' && killsBetween(kills, t - PELLET_SECONDS, t + SAME_FRAME) >= SHOTGUN_KILLS) earned.add('shotgun3');
    if (kind === 'back' && killsBetween(kills, t - SAME_FRAME, t + SAME_FRAME, 'Shielded_Enemy') > 0) earned.add('backstab');
    if (kind === 'eye' && killsBetween(kills, t - SAME_FRAME, t + SAME_FRAME, 'Cyclops_Boss') > 0) earned.add('eye');
    // Freny's own grenade ends the run: the last thing in it
    if (kind === 'oops' && t >= gameTime - 5) earned.add('oops');
  }
  return ACHIEVEMENTS.filter((id) => earned.has(id));
}
