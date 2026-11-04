import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { boardFields, perfilFields, achievementFields } from '../tools/rotate-score-key.mjs';

const KEY = 'n'.repeat(64);
const sha = (s) => createHash('sha256').update(s).digest('hex');

test('a board entry gets the signature the rules ask for', async () => {
  const f = await boardFields(KEY, 'leaderboard_hard', { id: 'u1', score: 500 });
  assert.deepEqual(f, { sig: sha(`${KEY}|u1|leaderboard_hard|500`) });
  assert.equal(await boardFields(KEY, 'leaderboard_hard', { id: 'u1' }), null);
});

test('a profile re-signs only the bests it has', async () => {
  const f = await perfilFields(KEY, { id: 'u1', bestHard: 500, bestEasy: 0 });
  assert.deepEqual(f, { sigHard: sha(`${KEY}|u1|leaderboard_hard|500`) });
  assert.equal(await perfilFields(KEY, { id: 'u1', bestHard: 0 }), null);
});

test('achievements re-sign what is there, and leave the title and the date alone', async () => {
  const f = await achievementFields(KEY, { id: 'u1', played: 'old', combo5: 'old', title: 'rei', updatedAt: 'x' });
  assert.deepEqual(f, { played: sha(`${KEY}|u1|ach|played`), combo5: sha(`${KEY}|u1|ach|combo5`) });
});
