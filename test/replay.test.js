import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { parseReplay, unpackReplay, frameAt } from '../replay/formato.js';
import { replayOf, replayId } from '../api/_lib/replay.js';

// writes a replay the way the game's RunRecorder does (format "FRR1")
export function fakeReplay({ seconds = 3, enemies = 2 } = {}) {
  const out = [];
  const u8 = (v) => out.push(v & 255);
  const u16 = (v) => { u8(v); u8(v >> 8); };
  const u32 = (v) => { u16(v & 0xffff); u16(v >>> 16); };
  const s16 = (v) => u16(v < 0 ? v + 65536 : v);
  const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v); out.push(...b); };
  const pos = (v) => s16(Math.round(v * 16));
  'FRR1'.split('').forEach((c) => u8(c.charCodeAt(0)));
  f32(0.1); f32(-16); f32(16); f32(-9); f32(9);
  pos(1); pos(1.5);
  u16(2);
  u8(0); u16(4); [[-16, -9], [16, -9], [16, -7], [-16, -7]].forEach(([x, y]) => { pos(x); pos(y); });   // the floor
  u8(1); u16(2); pos(-3); pos(2); pos(3); pos(2);   // a one-way platform's edge
  const seen = new Set();
  for (let step = 0; step <= seconds * 10; step++) {
    u32(step);
    pos(-10 + step * 0.2); pos(-6); u8(1 | 2 | (step > 20 ? 8 : 0)); u8(5); u8(1);
    u16(enemies);
    for (let e = 0; e < enemies; e++) {
      u16(e + 1);
      if (!seen.has(e)) {
        seen.add(e);
        u8(255);
        const name = Buffer.from(e === 0 ? 'Bug_Enemy' : 'Cyclops_Boss');
        u8(name.length); out.push(...name); pos(e === 0 ? 1 : 4); pos(e === 0 ? 0.6 : 4);
      }
      u8(e);
      pos(8 - step * 0.1); pos(-6 + e); u8(0);
    }
  }
  return Buffer.from(out);
}

test('a replay written like the game reads back', () => {
  const r = parseReplay(new Uint8Array(fakeReplay()));
  assert.equal(r.step, 0.10000000149011612);
  assert.deepEqual(r.cam, { left: -16, right: 16, bottom: -9, top: 9 });
  assert.deepEqual(r.freny, { w: 1, h: 1.5 });
  assert.equal(r.ground.length, 2);
  assert.deepEqual(r.ground[0], { closed: true, points: [[-16, -9], [16, -9], [16, -7], [-16, -7]] });
  assert.equal(r.ground[1].closed, false);
  assert.deepEqual(r.types.map((t) => t.name), ['Bug_Enemy', 'Cyclops_Boss']);
  assert.equal(r.types[1].w, 4);
  assert.equal(r.frames.length, 31);
  assert.ok(Math.abs(r.duration - 3) < 1e-6);
  assert.equal(r.frames[0].x, -10);
  assert.equal(r.frames[0].grounded, true);
  assert.equal(r.frames[25].auto, true);
  assert.equal(r.frames[10].enemies[1].type, 1);
  assert.equal(r.frames[10].enemies[1].y, -5);
});

test('a damaged replay keeps the frames it had', () => {
  const bytes = fakeReplay();
  const r = parseReplay(new Uint8Array(bytes.subarray(0, bytes.length - 5)));
  assert.equal(r.frames.length, 30);
});

test('something else is not a replay', () => {
  assert.throws(() => parseReplay(new Uint8Array(Buffer.from('nada disso aqui'))), /replay/);
});

test('base64 + gzip, as the game sends it, unpacks', async () => {
  const raw = fakeReplay();
  const back = await unpackReplay(gzipSync(raw).toString('base64'));
  assert.deepEqual(Buffer.from(back), raw);
});

test('the frame at a time', () => {
  const frames = [{ t: 0 }, { t: 0.1 }, { t: 0.2 }];
  assert.equal(frameAt(frames, 0.15), 1);
  assert.equal(frameAt(frames, 5), 2);
  assert.equal(frameAt(frames, -1), 0);
  assert.equal(frameAt([], 1), -1);
});

test('the API keeps only a base64 replay of a sane size, under one id per account, board and score', () => {
  assert.equal(replayOf({ replay: 'H4sIAAAAAAAA/w==' }), 'H4sIAAAAAAAA/w==');
  assert.equal(replayOf({ replay: 'not base64 at all!' }), null);
  assert.equal(replayOf({ replay: 'A'.repeat(4_000_001) }), null);
  assert.equal(replayOf({}), null);
  assert.equal(replayId('u1', 'leaderboard_hard', 12345), 'u1__leaderboard_hard__12345');
  assert.equal(replayId('a/b', 'x y', 'z'), 'ab__xy__0');
});
