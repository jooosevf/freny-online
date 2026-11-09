// The replay viewer of admin.html's Replay tab: draws a run recorded by the game (RunRecorder.cs,
// format in ./formato.js) with the Bestiário's pictures, a timeline of kills, hits and autopilot,
// and the kill feed. admin.html calls window.FrenyReplay.openId(id, token) for "Assistir"; a run
// from the editor (Logs/arena-run.json) is opened from a file or pasted.
import { parseReplay, unpackReplay, frameAt } from "./formato.js";

// the game's prefab -> the Bestiário's picture (bestiario/<sprite>_anda.png)
const SPRITES = {
  Bug_Enemy: "inseto", Bat_Enemy: "morcego", Golem_Enemy: "golem", Sorcerer_Enemy: "feiticeiro",
  Licker_Enemy: "linguarudo", Golem_Red: "golem_vermelho", Sorcerer_Supreme: "feiticeiro_supremo",
  Shielded_Enemy: "escudeiro", Cyclops_Boss: "ciclope", SpiderMine_Enemy: "mina_aranha",
  Tentacle_Enemy: "tentaculo", Crawler_Enemy: "rastejante",
};
const NAMES = {
  Bug_Enemy: "Inseto", Bat_Enemy: "Morcego", Golem_Enemy: "Golem", Sorcerer_Enemy: "Feiticeiro",
  Licker_Enemy: "Linguarudo", Golem_Red: "Golem Vermelho", Sorcerer_Supreme: "Feiticeiro Supremo",
  Shielded_Enemy: "Escudeiro", Cyclops_Boss: "Ciclope", SpiderMine_Enemy: "Mina-aranha",
  Tentacle_Enemy: "Tentáculo", Crawler_Enemy: "Rastejante",
};

const view = document.getElementById("view"), ctx = view.getContext("2d");
const line = document.getElementById("timeline"), lctx = line.getContext("2d");
const $ = (id) => document.getElementById(id);
// errors in red: the admin has to see why a run doesn't open
const say = (t) => { $("rmsg").textContent = t; $("rmsg").style.color = /^Erro/.test(t) ? "#ff7a7a" : ""; };

let rep = null, kills = [], hits = [], t = 0, playing = false, last = 0;
const pictures = {}, frameCounts = {};

function picture(src) {
  if (!pictures[src]) { const img = new Image(); img.onload = () => { if (!playing) draw(); }; img.src = src; pictures[src] = img; }
  return pictures[src];
}
fetch("/bestiario.json").then((r) => r.json()).then((d) => {
  (d.inimigos || []).forEach((e) => { frameCounts[e.sprite] = (e.quadros && e.quadros.anda) || 1; });
}).catch(() => {});

// when Freny took damage: the run log's "hit" and "fall" entries ([t, kind, n], api/_lib/vitals.js)
function hitsOf(vitals) {
  return (vitals || []).filter((v) => Array.isArray(v) && (v[1] === "hit" || v[1] === "fall")).map((v) => v[0]);
}

async function show(data) {
  const bytes = await unpackReplay(data.replay);
  rep = parseReplay(bytes);
  kills = (data.kills || []).filter(Array.isArray);
  hits = hitsOf(data.vitals);
  $("rtitle").textContent = "Replay · " + (data.name || data.uid || "partida") + (data.score != null ? " · " + Number(data.score).toLocaleString("pt-BR") + " pontos" : "") + (data.board ? " · " + data.board : "");
  t = 0;
  drawTimeline();
  feed();
  say(rep.frames.length + " quadros, " + fmt(rep.duration) + " de partida, " + rep.types.length + " tipos de inimigo.");
  draw();
}

function fmt(s) { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ":" + String(Math.floor(s % 60)).padStart(2, "0"); }

// world -> canvas: the arena's screen fills the canvas
function toCanvas(x, y) {
  const c = rep.cam;
  return [(x - c.left) / (c.right - c.left) * view.width, (c.top - y) / (c.top - c.bottom) * view.height];
}
function scale() { return view.width / (rep.cam.right - rep.cam.left); }

function drawSprite(img, frames, x, y, w, h, right, time) {
  const [cx, cy] = toCanvas(x, y);
  const k = scale(), dw = w * k, dh = h * k;
  if (img && img.complete && img.naturalWidth) {
    const fw = img.naturalWidth / frames, fi = Math.floor(time * 8) % frames;
    ctx.save();
    ctx.translate(cx, cy);
    if (!right) ctx.scale(-1, 1);
    ctx.drawImage(img, fi * fw, 0, fw, img.naturalHeight, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = "#8a6f9e";
    ctx.fillRect(cx - dw / 2, cy - dh / 2, dw, dh);
  }
}

function draw() {
  if (!rep) return;
  const f = rep.frames, i = frameAt(f, t);
  ctx.clearRect(0, 0, view.width, view.height);
  const sky = ctx.createLinearGradient(0, 0, 0, view.height);
  sky.addColorStop(0, "#1b1226"); sky.addColorStop(1, "#07060a");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, view.width, view.height);
  ctx.fillStyle = "#3b3346"; ctx.strokeStyle = "#6a5c7c"; ctx.lineWidth = 2; ctx.lineJoin = "round";
  rep.ground.forEach((g) => {
    ctx.beginPath();
    g.points.forEach(([x, y], j) => { const [cx, cy] = toCanvas(x, y); if (j) ctx.lineTo(cx, cy); else ctx.moveTo(cx, cy); });
    if (g.closed) { ctx.closePath(); ctx.fill(); }
    ctx.stroke();
  });
  if (i < 0) return;
  const a = f[i], b = f[Math.min(i + 1, f.length - 1)];
  const k = b.t > a.t ? Math.min(1, (t - a.t) / (b.t - a.t)) : 0;
  const lerp = (p, q) => p + (q - p) * k;
  const nextById = new Map(b.enemies.map((e) => [e.id, e]));
  a.enemies.forEach((e) => {
    const n = nextById.get(e.id) || e, type = rep.types[e.type] || { name: "?", w: 1, h: 1 };
    const sprite = SPRITES[type.name];
    const img = sprite ? picture("/bestiario/" + sprite + "_anda.png") : null;
    const frames = frameCounts[sprite] || (img && img.naturalHeight ? Math.max(1, Math.round(img.naturalWidth / img.naturalHeight)) : 1);
    drawSprite(img, frames, lerp(e.x, n.x), lerp(e.y, n.y), type.w, type.h, e.right, t);
  });
  const fx = lerp(a.x, b.x), fy = lerp(a.y, b.y);
  const justHit = hits.some((h) => t >= h && t - h < 0.35);
  drawSprite(picture("/perfil/freny.png"), 1, fx, fy, Math.max(rep.freny.w, rep.freny.h), Math.max(rep.freny.w, rep.freny.h), a.right, t);
  if (justHit || a.auto) {
    const [cx, cy] = toCanvas(fx, fy), r = Math.max(rep.freny.w, rep.freny.h) * scale() * 0.7;
    ctx.strokeStyle = justHit ? "#ff7a7a" : "#c77dff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }
  // the last kills, written where Freny is
  ctx.font = "bold 18px system-ui"; ctx.textAlign = "center";
  kills.filter((kk) => kk[0] <= t && t - kk[0] < 1).forEach((kk, j) => {
    const [cx, cy] = toCanvas(fx, fy);
    ctx.fillStyle = "rgba(111,220,140," + (1 - (t - kk[0])) + ")";
    ctx.fillText("+" + (NAMES[kk[1]] || kk[1]), cx, cy - 40 - j * 20 - (t - kk[0]) * 30);
  });
  $("clock").textContent = fmt(t) + " / " + fmt(rep.duration);
  $("kills").textContent = kills.filter((kk) => kk[0] <= t).length;
  $("hp").textContent = a.hp + (a.armor ? " +" + a.armor : "");
  $("alive").textContent = a.enemies.length;
  $("autoNote").textContent = a.auto ? "piloto automático jogando" : "";
  $("seek").value = rep.duration ? Math.round(t / rep.duration * 1000) : 0;
  drawCursor();
  feedNow();
}

function drawTimeline() {
  lctx.clearRect(0, 0, line.width, line.height);
  lctx.fillStyle = "#211a2e"; lctx.fillRect(0, 0, line.width, line.height);
  if (!rep || !rep.duration) return;
  const x = (s) => s / rep.duration * line.width;
  let start = null;
  rep.frames.forEach((fr) => {
    if (fr.auto && start == null) start = fr.t;
    if (!fr.auto && start != null) { lctx.fillStyle = "#c77dff55"; lctx.fillRect(x(start), 0, x(fr.t) - x(start), line.height); start = null; }
  });
  if (start != null) { lctx.fillStyle = "#c77dff55"; lctx.fillRect(x(start), 0, line.width - x(start), line.height); }
  lctx.fillStyle = "#6fdc8c"; kills.forEach((kk) => lctx.fillRect(x(kk[0]), 12, 1, 10));
  lctx.fillStyle = "#ff7a7a"; hits.forEach((h) => lctx.fillRect(x(h) - 1, 0, 3, 11));
  timelineBase = lctx.getImageData(0, 0, line.width, line.height);
}
let timelineBase = null;
function drawCursor() {
  if (!timelineBase) return;
  lctx.putImageData(timelineBase, 0, 0);
  lctx.fillStyle = "#fff";
  lctx.fillRect(t / rep.duration * line.width - 1, 0, 2, line.height);
}

let feedRows = [];
function feed() {
  const box = $("feed");
  box.innerHTML = "";
  const rows = kills.map((kk) => ({ t: kk[0], text: fmt(kk[0]) + "  abate: " + (NAMES[kk[1]] || kk[1]) + (kk[2] ? " (combo " + (1 + kk[2] / 10).toFixed(1) + "x)" : "") }))
    .concat(hits.map((h) => ({ t: h, text: fmt(h) + "  Freny levou dano" })))
    .sort((p, q) => p.t - q.t);
  feedRows = rows.map((r) => { const d = document.createElement("div"); d.textContent = r.text; d.onclick = () => { t = r.t - 1; draw(); }; d.style.cursor = "pointer"; box.appendChild(d); return { t: r.t, el: d }; });
}
let lastNow = null;
function feedNow() {
  let now = null;
  for (const r of feedRows) { if (r.t <= t) now = r; else break; }
  if (now === lastNow) return;
  if (lastNow) lastNow.el.className = "";
  if (now) { now.el.className = "now"; if (playing) now.el.scrollIntoView({ block: "nearest" }); }
  lastNow = now;
}

function tick(ms) {
  if (playing && rep) {
    t += (ms - last) / 1000 * Number($("speed").value);
    if (t >= rep.duration) { t = rep.duration; playing = false; $("play").textContent = "▶"; }
    draw();
  }
  last = ms;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

$("play").onclick = () => { if (!rep) return; if (t >= rep.duration) t = 0; playing = !playing; $("play").textContent = playing ? "❚❚" : "▶"; };
$("back").onclick = () => { t = Math.max(0, t - 5); draw(); };
$("fwd").onclick = () => { if (rep) t = Math.min(rep.duration, t + 5); draw(); };
$("seek").oninput = (e) => { if (rep) { t = e.target.value / 1000 * rep.duration; draw(); } };
line.onclick = (e) => { if (!rep) return; const r = line.getBoundingClientRect(); t = (e.clientX - r.left) / r.width * rep.duration; draw(); };
$("nextHit").onclick = () => { const h = hits.find((s) => s > t + 0.6); if (h != null) { t = Math.max(0, h - 1.5); draw(); } };
$("prevHit").onclick = () => { const h = hits.filter((s) => s < t - 1.6).pop(); if (h != null) { t = Math.max(0, h - 1.5); draw(); } };
document.addEventListener("keydown", (e) => {
  if ($("tab-replay").hidden) return;
  if ((e.target.tagName === "INPUT" && e.target.type !== "range") || e.target.tagName === "TEXTAREA") return;
  if (e.code === "Space") { e.preventDefault(); $("play").onclick(); }
  if (e.code === "ArrowLeft") $("back").onclick();
  if (e.code === "ArrowRight") $("fwd").onclick();
});

// an editor run (Logs/arena-run.json, the same JSON the game sends)
// a pasted or opened run: the whole JSON the game sends, or just its "replay" text
async function openRun(text, name) {
  try {
    text = text.trim();
    if (!text) throw new Error("nada colado");
    let run;
    if (text[0] === "{") run = JSON.parse(text);
    else if (/^"?[A-Za-z0-9+/=\s]+"?$/.test(text)) run = { replay: text.replace(/["\s]/g, "") };
    else throw new Error("isso não parece o JSON de uma partida");
    if (run.run && !run.replay) run = run.run;
    if (!run.replay) throw new Error("esse JSON não tem replay (é de uma versão antiga do jogo?)");
    await show({ replay: run.replay, kills: run.kills, vitals: run.vitals, score: run.score, board: run.board, name });
  } catch (err) {
    say("Erro: " + (err instanceof RangeError ? "a gravação está cortada ou é de uma versão de teste antiga do jogo" : err.message));
  }
}
$("file").onchange = async (e) => {
  const file = e.target.files[0];
  if (file) openRun(await file.text(), file.name);
};
$("openPaste").onclick = () => openRun($("paste").value, "JSON colado");
$("clearPaste").onclick = () => { $("paste").value = ""; $("paste").focus(); };
// pasting into the box opens it at once
$("paste").addEventListener("paste", () => setTimeout(() => openRun($("paste").value, "JSON colado"), 0));

// one kept by the API (the admin's "Assistir"), with the admin password
async function openId(id, token) {
  say("Carregando o replay...");
  try {
    const r = await fetch("/api/admin/replay", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": token }, body: JSON.stringify({ id }) });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error || r.status);
    await show(b);
  } catch (e) { say("Erro: " + e.message); }
}
// stops playing when the admin leaves the tab
function pause() { if (playing) $("play").onclick(); }
// a replay drawn while the tab was hidden has a canvas of the right size already, but redraw anyway
function redraw() { if (rep) { drawTimeline(); draw(); } }

window.FrenyReplay = { openId, openRun, pause, redraw };
