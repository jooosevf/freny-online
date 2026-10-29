import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRun, killPoints } from '../api/_lib/validate.js';
import { makeRunToken, readRunToken } from '../api/_lib/run-token.js';

// a steady run: one kill every `every` seconds, alternating Bugs and Bats, the combo never drops
function steadyRun(board, count, every, names = ['Bug_Enemy', 'Bat_Enemy']) {
  const kills = [];
  let score = 0;
  for (let i = 0; i < count; i++) {
    const name = names[i % names.length];
    kills.push([3 + i * every, name, i]);
    score += killPoints({ Bug_Enemy: 100, Bat_Enemy: 150, Golem_Red: 500 }[name], i);
  }
  return { board, score, gameTime: 3 + count * every, kills };
}

test('the points of a kill follow the game: base x combo, rounded', () => {
  assert.equal(killPoints(100, 0), 100);
  assert.equal(killPoints(100, 1), 110);
  assert.equal(killPoints(150, 5), 225);
  assert.equal(killPoints(600, 10), 1200);
});

test('a real-looking run is accepted', () => {
  const run = steadyRun('leaderboard_medium', 100, 2);
  assert.equal(validateRun(run, run.gameTime), null);
});

test('a score the kills do not add up to is refused', () => {
  const run = steadyRun('leaderboard_medium', 100, 2);
  run.score += 5000;
  assert.match(validateRun(run, run.gameTime), /somam/);
});

test('a run shorter in real time than in game time is refused', () => {
  const run = steadyRun('leaderboard_medium', 100, 2);
  assert.match(validateRun(run, 60), /tempo real/);
  // at 1.5x game speed it fits
  assert.equal(validateRun(run, run.gameTime / 1.5), null);
});

test('the combo has to drop after 10 s without a kill', () => {
  const run = steadyRun('leaderboard_medium', 10, 2);
  run.kills[5][0] = run.kills[4][0] + 11;
  for (let i = 6; i < 10; i++) run.kills[i][0] = run.kills[5][0] + (i - 5) * 2;
  run.gameTime = run.kills[9][0] + 1;
  assert.match(validateRun(run, run.gameTime), /combo/);
});

test('too many kills in 10 s are refused', () => {
  const run = steadyRun('leaderboard_medium', 200, 0.1);
  assert.match(validateRun(run, run.gameTime), /abates demais/);
});

test('unknown enemies and enemies before their time are refused', () => {
  const run = steadyRun('leaderboard_medium', 3, 2);
  run.kills[1][1] = 'Dragon';
  assert.match(validateRun(run, run.gameTime), /desconhecido/);
  const early = steadyRun('leaderboard_medium', 3, 2, ['Golem_Red']);
  assert.match(validateRun(early, early.gameTime), /cedo|antes/);
});

test('the run ticket only opens with the right key', async () => {
  const key = 'k'.repeat(64);
  const token = await makeRunToken(key, 'uid1', 'leaderboard_hard', 1000);
  assert.deepEqual(await readRunToken(key, token), { uid: 'uid1', board: 'leaderboard_hard', startedAt: 1000 });
  assert.equal(await readRunToken('x'.repeat(64), token), null);
  const [body, sig] = token.split('.');
  assert.equal(await readRunToken(key, body.slice(0, -2) + 'AA.' + sig), null);
});
