// What the game allows in an Arena run, copied from the Unity project (theRiseOfFreny).
// When a number changes in the game, change it here too, or honest runs start being refused:
//   ENEMIES.score  = scoreToAdd on each prefab in Assets/Prefabs/Enemies
//   ENEMIES.unlockAt / unlockScore = the ArenaDirector entries in "ZE Arena.unity"
//   LEVELS = ArenaDifficulty.cs (RampFactor, StartAt, UnlockShift)
//   COMBO_SECONDS = ComboManager.totalTime in "ZE Arena.unity"

export const BOARDS = ['leaderboard_hard', 'leaderboard_freny', 'leaderboard_medium', 'leaderboard_easy'];

export const ENEMIES = {
  Bug_Enemy: { score: 100, unlockAt: 0 },
  Bat_Enemy: { score: 150, unlockAt: 0 },
  Golem_Enemy: { score: 200, unlockAt: 0.5 },
  Sorcerer_Enemy: { score: 350, unlockAt: 0.35 },
  Licker_Enemy: { score: 500, unlockAt: 0.2 },
  Golem_Red: { score: 500, unlockAt: 0.65, unlockScore: 50000 },
  // and never below 100 000 points (PR #154)
  Sorcerer_Supreme: { score: 600, unlockAt: 0.8, unlockScore: 100000 },
  // PR #149 (Escudeiro and Ciclope)
  Shielded_Enemy: { score: 300, unlockAt: 0.4 },
  // first at 50 000 points, then every 100 000 (PR #154); two at once only from 1 000 000
  Cyclops_Boss: { score: 5000, unlockAt: 0, unlockScore: 50000 },
};

export const LEVELS = {
  leaderboard_easy: { rampFactor: 1.6, startAt: 0, unlockShift: 0.15, spawnIntervalFactor: 1.25 },
  leaderboard_medium: { rampFactor: 1, startAt: 0, unlockShift: 0, spawnIntervalFactor: 1 },
  leaderboard_hard: { rampFactor: 0.7, startAt: 0.15, unlockShift: -0.1, spawnIntervalFactor: 0.8 },
  leaderboard_freny: { rampFactor: 0.5, startAt: 0.3, unlockShift: -0.2, spawnIntervalFactor: 0.6 },
};

// the shortest ramp the Tuning slider allows (Tuning.RampSeconds, 60..600 s, 300 by default)
export const MIN_RAMP_SECONDS = 60;
export const COMBO_SECONDS = 10;
// GameSpeed.Max: game time runs at most this much faster than real time
export const MAX_GAME_SPEED = 1.5;
// Kills in any 10 game seconds can't be more than the enemies the arena can have in that time:
// the ones already there (ArenaDirector.MaxEnemies 24, plus portals opening) and the ones it can
// spawn. Its fastest spawn gap is SpawnInterval at the peak (0.8 s x the level's factor), x0.35 when
// the arena is half empty, shorter still in overtime (/ (1 + 0.15 per minute past the peak)).
// KILL_POOL also covers the Ciclope and its helpers. A grenade or a combo can clear the screen at
// once, so this is the arena's limit, not a guess at how fast someone plays.
export const KILL_WINDOW_SECONDS = 10;
export const KILL_POOL = 40;
export const PEAK_SPAWN_SECONDS = 0.8;
export const SPARSE_SPAWN_FACTOR = 0.35;
export const MAX_RUN_SECONDS = 6 * 3600;
export const MAX_SCORE = 1000000000;
