import {
  BOARDS, ENEMIES, LEVELS, MIN_RAMP_SECONDS, COMBO_SECONDS, MAX_GAME_SPEED,
  KILL_WINDOW_SECONDS, MAX_KILLS_PER_WINDOW, MAX_RUN_SECONDS, MAX_SCORE,
} from './rules.js';

// A kill a frame or two either side of the combo timeout can go either way.
const COMBO_SLACK = 0.25;
// Latency between the start call and the run's first frame, and between death and the finish call.
const REAL_TIME_SLACK = 15;

const f32 = Math.fround;
const STEP = f32(0.1);

// ComboManager: the multiplier starts at 1.0f and each kill adds 0.1f, in floats.
const comboCache = [f32(1)];
function combo(k) {
  while (comboCache.length <= k) comboCache.push(f32(comboCache[comboCache.length - 1] + STEP));
  return comboCache[k];
}

// Mathf.RoundToInt rounds halves to even.
function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

// UIManager.HandleComboManager: scoreToAdd * combo, as a float, rounded.
export function killPoints(base, k) {
  return roundHalfEven(f32(base * combo(k)));
}

// Checks that the run's kill log adds up to its score and could have happened in the game.
// run: { board, score, gameTime, kills: [[seconds since start, enemy prefab name, combo step], ...] }
// realSeconds: the server's time between the run's start and now.
// Returns null when the run is fine, or the reason it is refused.
export function validateRun(run, realSeconds) {
  if (!run || typeof run !== 'object') return 'corpo inválido';
  const { board, score, gameTime, kills } = run;
  if (!BOARDS.includes(board)) return 'ranking desconhecido';
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return 'pontuação inválida';
  if (typeof gameTime !== 'number' || !(gameTime >= 0)) return 'tempo de jogo inválido';
  if (!Array.isArray(kills) || kills.length > 200000) return 'registro inválido';
  if (realSeconds > MAX_RUN_SECONDS) return 'partida longa demais';
  if (gameTime > (realSeconds + REAL_TIME_SLACK) * MAX_GAME_SPEED) return 'mais tempo de jogo do que tempo real';

  const level = LEVELS[board];
  const ramp = MIN_RAMP_SECONDS * level.rampFactor;
  let total = 0;
  let prevT = -Infinity;
  let prevK = -1;
  for (let i = 0; i < kills.length; i++) {
    const kill = kills[i];
    if (!Array.isArray(kill) || kill.length !== 3) return `abate ${i} inválido`;
    const [t, name, k] = kill;
    const enemy = Object.prototype.hasOwnProperty.call(ENEMIES, name) ? ENEMIES[name] : null;
    if (!enemy) return `inimigo desconhecido: ${String(name).slice(0, 40)}`;
    if (typeof t !== 'number' || !(t >= 0) || t < prevT || t > gameTime + 1) return `abate ${i} fora de ordem`;
    if (!Number.isInteger(k) || k < 0) return `combo inválido no abate ${i}`;

    // the combo goes up by one per kill and drops back to 1.0x after COMBO_SECONDS without one
    const gap = t - prevT;
    const keeps = k === prevK + 1 && gap <= COMBO_SECONDS + COMBO_SLACK;
    const resets = k === 0 && gap >= COMBO_SECONDS - COMBO_SLACK;
    if (!keeps && !resets) return `combo não bate no abate ${i}`;

    // strong enemies only appear once the difficulty curve gets to them, and the red Golem
    // also waits for 50 000 points
    const unlockAt = enemy.unlockAt > 0 ? Math.max(0, enemy.unlockAt + level.unlockShift - level.startAt) * ramp : 0;
    if (t < unlockAt) return `${name} cedo demais (${t.toFixed(1)} s)`;
    if (enemy.unlockScore && total < enemy.unlockScore) return `${name} antes de ${enemy.unlockScore} pontos`;

    // no more kills in any window than the arena can spawn and Freny can kill
    let first = i;
    while (first > 0 && t - kills[first - 1][0] < KILL_WINDOW_SECONDS) first--;
    if (i - first + 1 > MAX_KILLS_PER_WINDOW) return `abates demais em ${KILL_WINDOW_SECONDS} s (${t.toFixed(1)} s)`;

    total += killPoints(enemy.score, k);
    prevT = t;
    prevK = k;
  }
  // float rounding can drift a point here and there in very long combos
  if (Math.abs(total - score) > Math.max(2, score * 0.0001)) return `os abates somam ${total}, não ${score}`;
  return null;
}
