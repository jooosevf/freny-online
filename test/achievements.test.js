import test from 'node:test';
import assert from 'node:assert/strict';
import { earnedAchievements } from '../api/_lib/achievements.js';

const run = (kills, events = [], extra = {}) => ({ score: 1000, gameTime: 120, kills, events, ...extra });

test('a plain run earns nothing', () => {
  assert.deepEqual(earnedAchievements(run([[3, 'Bug_Enemy', 0]])), []);
});

test('the score, the time and the bosses come from the log itself', () => {
  const got = earnedAchievements(run([[100, 'Cyclops_Boss', 0], [101, 'Sorcerer_Supreme', 1]], [], { score: 1000000, gameTime: 600 }));
  assert.deepEqual(got, ['million', 'cyclops', 'supreme', 'survivor']);
});

test('combo 50x needs the kill at step 489', () => {
  assert.deepEqual(earnedAchievements(run([[5, 'Bug_Enemy', 488]])), []);
  assert.deepEqual(earnedAchievements(run([[5, 'Bug_Enemy', 489]])), ['combo50']);
});

test('three Ciclopes, 500 kills and 30 minutes in one run', () => {
  const two = [[100, 'Cyclops_Boss', 0], [200, 'Cyclops_Boss', 0]];
  assert.deepEqual(earnedAchievements(run(two)), ['cyclops']);
  assert.deepEqual(earnedAchievements(run([...two, [300, 'Cyclops_Boss', 0]])), ['cyclops', 'cyclops3']);
  const many = Array.from({ length: 500 }, (_, i) => [i, 'Bug_Enemy', 0]);
  assert.deepEqual(earnedAchievements(run(many.slice(1))), []);
  assert.deepEqual(earnedAchievements(run(many)), ['kills500']);
  assert.deepEqual(earnedAchievements(run([], [], { gameTime: 1800 })), ['survivor', 'marathon']);
});

test('ten Escudeiros from behind in one run', () => {
  const at = Array.from({ length: 10 }, (_, i) => 10 + i);
  const kills = at.map((t) => [t, 'Shielded_Enemy', 0]);
  const events = at.map((t) => [t, 'back', 1]);
  assert.deepEqual(earnedAchievements(run(kills.slice(1), events.slice(1))), []);
  assert.deepEqual(earnedAchievements(run(kills, events)), ['backstab']);
});

test('a grenade needs five kills in its frame', () => {
  const four = [1, 2, 3, 4].map((i) => [50, 'Bug_Enemy', i]);
  assert.deepEqual(earnedAchievements(run(four, [[50, 'grenade', 5]])), []);
  const five = [...four, [50.01, 'Bat_Enemy', 5]];
  assert.deepEqual(earnedAchievements(run(five, [[50, 'grenade', 5]])), ['grenade5']);
});

test('a shotgun shot needs three kills by then', () => {
  const kills = [[30, 'Bug_Enemy', 0], [30.2, 'Bug_Enemy', 1], [30.4, 'Bat_Enemy', 2]];
  assert.deepEqual(earnedAchievements(run(kills, [[30.4, 'shotgun', 3]])), ['shotgun3']);
  assert.deepEqual(earnedAchievements(run(kills.slice(0, 2), [[30.4, 'shotgun', 3]])), []);
});

test('back and eye need the right enemy dying right then', () => {
  const ten = Array.from({ length: 10 }, (_, i) => 40 + i);
  assert.deepEqual(earnedAchievements(run(ten.map((t) => [t, 'Bug_Enemy', 0]), ten.map((t) => [t, 'back', 1]))), []);
  assert.deepEqual(earnedAchievements(run([[70, 'Cyclops_Boss', 0]], [[70, 'eye', 1]])), ['cyclops', 'eye']);
});

test('the own grenade only at the end of the run', () => {
  assert.deepEqual(earnedAchievements(run([], [[119, 'oops', 1]])), ['oops']);
  assert.deepEqual(earnedAchievements(run([], [[20, 'oops', 1]])), []);
});
