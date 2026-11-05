// Reads the game's run replay (Assets/Scripts/Online/RunRecorder.cs, format "FRR1"): the bytes
// after base64 and gunzip. Used by replay.html and by test/replay.test.js.
const UNIT = 16;

export function parseReplay(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  const u8 = () => view.getUint8(at++);
  const u16 = () => { const v = view.getUint16(at, true); at += 2; return v; };
  const u32 = () => { const v = view.getUint32(at, true); at += 4; return v; };
  const s16 = () => { const v = view.getInt16(at, true); at += 2; return v; };
  const f32 = () => { const v = view.getFloat32(at, true); at += 4; return v; };
  const pos = () => s16() / UNIT;

  const magic = String.fromCharCode(u8(), u8(), u8(), u8());
  if (magic !== 'FRR1') throw new Error('não é um replay do Freny');
  const step = f32();
  const cam = { left: f32(), right: f32(), bottom: f32(), top: f32() };
  const freny = { w: pos(), h: pos() };
  // the floor, walls and platforms: closed polygons (kind 0) and open lines (kind 1)
  const ground = [];
  for (let n = u16(), i = 0; i < n; i++) {
    const kind = u8(), points = [];
    for (let m = u16(), j = 0; j < m; j++) points.push([pos(), pos()]);
    ground.push({ closed: kind === 0, points });
  }

  const types = [];
  const frames = [];
  const decoder = new TextDecoder();
  // a run cut off in the middle of a frame (it can't be, but a damaged one) keeps what it had
  try {
    while (at < bytes.byteLength) {
      const t = u32() * step;
      const p = { x: pos(), y: pos(), flags: u8(), hp: u8(), armor: u8() };
      const enemies = [];
      for (let n = u16(), i = 0; i < n; i++) {
        const id = u16();
        let type = u8();
        if (type === 255) {
          const len = u8();
          const name = decoder.decode(bytes.subarray(at, at + len));
          at += len;
          types.push({ name, w: pos(), h: pos() });
          type = u8();
        }
        enemies.push({ id, type, x: pos(), y: pos(), right: (u8() & 1) === 1 });
      }
      frames.push({
        t, x: p.x, y: p.y, right: (p.flags & 1) !== 0, grounded: (p.flags & 2) !== 0,
        dead: (p.flags & 4) !== 0, auto: (p.flags & 8) !== 0, hp: p.hp, armor: p.armor, enemies,
      });
    }
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
  }
  return { step, cam, freny, ground, types, frames, duration: frames.length ? frames[frames.length - 1].t : 0 };
}

// base64 (what the API keeps) -> the gunzipped bytes
export async function unpackReplay(base64) {
  const zipped = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const stream = new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// the frame at time t and the next one, for drawing in between (index of the last frame <= t)
export function frameAt(frames, t) {
  let lo = 0, hi = frames.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}
