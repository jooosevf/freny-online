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
    score += killPoints({ Bug_Enemy: 100, Bat_Enemy: 150, Golem_Red: 500, Tentacle_Enemy: 250, Crawler_Enemy: 200 }[name], i);
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

test('a screen-clearing burst is fine, more kills than the arena can spawn are not', () => {
  const burst = steadyRun('leaderboard_easy', 60, 10 / 60);
  assert.equal(validateRun(burst, burst.gameTime), null);
  const run = steadyRun('leaderboard_medium', 400, 0.05);
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

test('the Cyclops only counts after 50 000 points', () => {
  const early = steadyRun('leaderboard_hard', 1, 2, ['Cyclops_Boss']);
  early.score = killPoints(5000, 0);
  assert.match(validateRun(early, early.gameTime), /antes de 50000/);
});

test('a preflight from another address gets the CORS headers', async () => {
  const { default: start } = await import('../api/run/start.js');
  const res = await start(new Request('http://x/api/run/start', { method: 'OPTIONS' }));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test("today's board follows Brasília time", async () => {
  const { dailyBoardOf } = await import('../api/_lib/validate.js');
  assert.equal(dailyBoardOf('leaderboard_hard', Date.UTC(2026, 9, 30, 2, 0)), 'daily_hard_20261029');
  assert.equal(dailyBoardOf('leaderboard_easy', Date.UTC(2026, 9, 30, 3, 0)), 'daily_easy_20261030');
});

test('the Feiticeiro Supremo only counts after 100 000 points', () => {
  const run = steadyRun('leaderboard_hard', 1, 2, ['Sorcerer_Supreme']);
  run.kills[0][0] = 400;
  run.gameTime = 401;
  run.score = killPoints(600, 0);
  assert.match(validateRun(run, run.gameTime), /antes de 100000/);
});

test('the Mina-aranha counts once the arena is past 0.45', () => {
  const early = steadyRun('leaderboard_medium', 1, 2, ['SpiderMine_Enemy']);
  early.kills[0][0] = 10;
  early.gameTime = 11;
  early.score = killPoints(250, 0);
  assert.match(validateRun(early, early.gameTime), /cedo/);
  const late = steadyRun('leaderboard_medium', 1, 2, ['SpiderMine_Enemy']);
  late.kills[0][0] = 40;
  late.gameTime = 41;
  late.score = killPoints(250, 0);
  assert.equal(validateRun(late, late.gameTime), null);
});

test("the Poço de Ácido's Tentáculo and Rastejante count, the Rastejante a little into the run", () => {
  // same boards as the classic arena: a Médio run with both of them in it
  const run = steadyRun('leaderboard_medium', 60, 2, ['Tentacle_Enemy', 'Bug_Enemy', 'Crawler_Enemy']);
  // the Rastejante unlocks at 0.15 of the curve: 9 s into a Médio run at the shortest ramp
  run.kills.forEach((k, i) => { k[0] = 10 + i * 2; });
  run.gameTime = 10 + 60 * 2;
  assert.equal(validateRun(run, run.gameTime), null);
  const early = steadyRun('leaderboard_medium', 1, 2, ['Crawler_Enemy']);
  assert.match(validateRun(early, early.gameTime), /cedo/);
  // the Tentáculo comes from the start, on every level
  const tentacle = steadyRun('leaderboard_easy', 1, 2, ['Tentacle_Enemy']);
  assert.equal(validateRun(tentacle, tentacle.gameTime), null);
});

test('the week\'s mutator matches the game (WeeklyMutators.cs) and turns on Monday, Brasília time', async () => {
  const { weeklyMutator, weekIndex, MUTATORS } = await import('../api/_lib/rules.js');
  // Sunday 2026-11-01 is week 42: (42 * 5 + 3) % 8 = 5
  assert.equal(weekIndex(Date.UTC(2026, 10, 1, 12)), 42);
  assert.equal(weeklyMutator(Date.UTC(2026, 10, 1, 12)), 'red_moon');
  // still Sunday in Brasília at 02:59 UTC on Monday; the new week at 03:00
  assert.equal(weeklyMutator(Date.UTC(2026, 10, 2, 2, 59)), 'red_moon');
  assert.equal(weeklyMutator(Date.UTC(2026, 10, 2, 3, 0)), 'eternal_night');
  // eight weeks in a row: all eight, no week like the one before
  const weeks = [];
  for (let w = 0; w < 8; w++) weeks.push(weeklyMutator(Date.UTC(2026, 10, 2, 12) + w * 7 * 24 * 3600 * 1000));
  assert.equal(new Set(weeks).size, MUTATORS.length);
  // and before the first Monday it still lands in the pool
  assert.ok(MUTATORS.includes(weeklyMutator(Date.UTC(2025, 5, 1))));
});

test('a run with a blessing and a mutator in its log is checked like any other', () => {
  const run = steadyRun('leaderboard_hard', 100, 2);
  run.blessing = 'strength';
  run.mutator = 'giants';
  assert.equal(validateRun(run, run.gameTime), null);
});
