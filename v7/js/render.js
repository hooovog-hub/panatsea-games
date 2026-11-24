// Отрисовка забега на canvas. Только визуал: состояние берётся из симуляции.
// Цвета — из brand/tokens.css (читаются из CSS-переменных при старте).
import { TRACK } from '../shared/track.js';
import { P } from '../shared/sim.js';
import { drawRunnerFigure } from './runner.js';
import { ART, BUILDINGS, STATUES, FENCE, BACK, TREES, CUPS, FRONT_ORDER, DEPTH, HEIGHT_OVERRIDE, PARK_BUILDING, drawArt } from './art.js';

let C = {};
export function loadColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  C = {
    accent: v('--pn-accent'), coral: v('--pn-coral'), logo: v('--pn-logo'), text: v('--pn-text'),
    muted: v('--pn-text-muted'), line: v('--pn-line'), sky: v('--pn-line-sky'), yellow: v('--pn-line-yellow'),
    skyTop: v('--pn-ill-sky-top'), skyLow: v('--pn-ill-sky-low'), sun: v('--pn-ill-sun'),
    ararat: v('--pn-ill-ararat'), snow: v('--pn-ill-snow'), tuff: v('--pn-ill-tuff'), tuffFar: v('--pn-ill-tuff-far'),
    window: v('--pn-ill-window'), street: v('--pn-ill-street'), road: v('--pn-ill-road'),
    skin: v('--pn-ill-skin'), skinShade: v('--pn-ill-skin-shade'), hair: v('--pn-ill-hair'), white: v('--pn-bg'),
    leggings: v('--pn-ill-leggings'), sock: v('--pn-ill-sock'),
    cityFar: v('--pn-ill-city-far'), cityFar2: v('--pn-ill-city-far-2'), cityWin: v('--pn-ill-city-window'),
    cups: [
      [v('--pn-cup-mango'), v('--pn-cup-mango-accent')],
      [v('--pn-cup-berry'), v('--pn-cup-berry-accent')],
      [v('--pn-cup-pistachio'), v('--pn-cup-pistachio-accent')],
    ],
  };
}

export const cupColor = (f) => C.cups[f][0];

// Псевдослучайность для декораций по индексу (стабильная, без Math.random).
const h01 = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

export function makeView(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  // В портрете видно ~420 ед. по ширине, в ландшафте ограничивает высота.
  const s = w < h ? Math.min(w / 360, h / 600) : Math.min(w / 420, h / 640);
  return { w, h, dpr, s, groundY: h * (w < h ? 0.67 : 0.78), runnerScreenX: w * (w < h ? 0.2 : 0.22) };
}

const particles = [];
export function burst(x, y, color, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    particles.push({ x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 + 60, life: 0.5, color });
  }
}

export function draw(ctx, view, st, runner, dt, opts = {}) {
  const { w, h, dpr, s, groundY } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const camX = st.x - view.runnerScreenX / s;
  const X = (wx) => (wx - camX) * s;
  const Y = (wy) => groundY - wy * s;

  // небо
  const g = ctx.createLinearGradient(0, 0, 0, groundY);
  g.addColorStop(0, C.skyTop); g.addColorStop(1, C.skyLow);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, groundY);

  // солнце
  ctx.fillStyle = C.sun; ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.arc(w * 0.8, groundY - 380 * s, 40 * s, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // Арарат — самый дальний план
  if (ART.mountain) {
    const mx = w * 0.58 - camX * 0.02 * s;
    drawArt(ctx, 'mountain', mx, groundY - 95 * s, 165 * s);
  } else drawArarat(ctx, view, camX);
  // 1) сплошной минималистичный горизонт — без промежутков
  drawSkyline(ctx, view, camX);
  // 2) второй ряд — обычные дома в дымке
  drawRow(ctx, view, camX, 'back');
  // 3) первый ряд — достопримечательности, памятники, забор, деревья
  // окно на гору сквозь парк — с мягкими краями
  drawParkView(ctx, view, camX);
  drawRow(ctx, view, camX, 'mid');

  // тротуар и дорога
  ctx.fillStyle = C.street; ctx.fillRect(0, groundY, w, h - groundY);
  ctx.fillStyle = C.road; ctx.fillRect(0, groundY + 26 * s, w, h - groundY);
  ctx.strokeStyle = C.road; ctx.lineWidth = 1;
  const tile = 60;
  for (let tx = Math.floor(camX / tile) * tile; X(tx) < w; tx += tile) {
    ctx.beginPath(); ctx.moveTo(X(tx), groundY); ctx.lineTo(X(tx) - 6 * s, groundY + 26 * s); ctx.stroke();
  }
  ctx.strokeStyle = C.white; ctx.lineWidth = 3 * s; ctx.setLineDash([28 * s, 26 * s]);
  ctx.lineDashOffset = (camX * s) % (54 * s);
  ctx.beginPath(); ctx.moveTo(0, groundY + 60 * s); ctx.lineTo(w, groundY + 60 * s); ctx.stroke();
  ctx.setLineDash([]);

  // деревья вдоль тротуара — между фонарями, разного размера
  if (TREES.length) {
    for (let i = Math.floor(camX / 520) - 1; X(i * 520) < w + 200; i++) {
      if (h01(i, 41) < 0.25) continue;
      const k = TREES[Math.floor(h01(i, 42) * TREES.length)];
      const th = 150 + h01(i, 43) * 110;
      const tx = i * 520 + 40 + h01(i, 44) * 120;
      if (tx < 520 || (tx > TRACK.length - 450 && tx < TRACK.length + 700)) continue;   // начало и финиш — без деревьев перед зданиями   // в первом кадре — Опера без деревьев перед ней
      if (X(tx) < -200 || X(tx) > w + 200) continue;
      drawArt(ctx, k, X(tx), Y(0) + 3 * s, th * s, 1, false, h01(i, 45) < 0.5);
    }
  }

  // фонари (декор)
  const lampGap = 520;
  for (let lx = Math.floor(camX / lampGap) * lampGap + 260; X(lx) < w + 60; lx += lampGap) {
    if (X(lx) < -60) continue;
    if (ART.lamp) { drawArt(ctx, 'lamp', X(lx), Y(0) + 2 * s, 175 * s); continue; }
    ctx.strokeStyle = C.logo; ctx.globalAlpha = 0.55; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(X(lx), Y(0)); ctx.lineTo(X(lx), Y(170)); ctx.lineTo(X(lx) + 18 * s, Y(176)); ctx.stroke();
    ctx.fillStyle = C.sun; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(X(lx) + 20 * s, Y(170), 6 * s, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // финиш
  drawFinish(ctx, X(TRACK.length), Y, s);

  // препятствия
  for (let i = Math.max(0, st.nextOb - 2); i < TRACK.obstacles.length; i++) {
    const o = TRACK.obstacles[i];
    if (X(o.x) > w + 50) break;
    drawObstacle(ctx, o, X, Y, s, st.hit[i]);
  }
  // йогурты
  const t = performance.now() / 1000;
  for (let i = Math.max(0, st.nextCup - 2); i < TRACK.cups.length; i++) {
    const c = TRACK.cups[i];
    if (X(c.x) > w + 50) break;
    if (st.got[i]) continue;
    const cy = c.y + Math.sin(t * 3 + i) * 3;
    if (ART[CUPS[c.f]]) drawArt(ctx, CUPS[c.f], X(c.x), Y(cy - 17), 36 * s);
    else drawCup(ctx, X(c.x), Y(cy), s, c.f, 1.25);
  }

  // бегун (мигает при неуязвимости)
  if (!(st.invuln > 0 && Math.floor(st.invuln / 5) % 2 === 0)) {
    drawRunner(ctx, X(st.x + P.runnerW / 2), Y(st.y), s, st, runner);
  }

  // частицы
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 200 * dt;
    ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 3 * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (opts.flash > 0) { ctx.fillStyle = C.coral; ctx.globalAlpha = opts.flash * 0.18; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
}

// Ряды зданий. Плотная расстановка без пустых мест, стабильная (фиксированное зерно).
// Глубина: задний ряд (k 0.17), первый ряд (k ≈ 0.33, как в варианте 1) из двух «планов» —
// часть зданий отодвинута вглубь: меньше, выше на экране, в дымке, заходит за соседей.
// Стыки закрываем деревьями. В середине — парк, где открывается вид на Арарат.
function mulberry(seed) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ROW_K = { back: 0.17, mid: 0.33 };
const FRONT_SCALE = 0.86;        // общий масштаб первого ряда
// Лёгкая глубина внутри первого ряда (на зрителя — совсем немного)
const DEPTH_SCALE = 0.05;        // ±5% размера
const DEPTH_LIFT = 5;            // дальние стоят на 5 ед. выше
const PLAZA = 8;                 // полоса мостовой под зданиями
const VIEW_W = 430;              // ширина кадра в единицах мира (с запасом)
const PARK = { x0: 0, x1: 0 };   // парк в координатах первого ряда: сквозь него видна гора
const rows = {};

function heightOf(k) { return HEIGHT_OVERRIDE[k] ?? (BUILDINGS.find((b) => b.k === k) ?? STATUES.find((b) => b.k === k))?.h ?? 150; }

function layoutMid() {
  const rng = mulberry(20261124);
  const items = [], trees = [];
  let x = -30, parkX0 = 0, parkX1 = 0, cascadeX = null;
  const tree = (cx, h, extra = {}) => trees.push({ k: TREES[Math.floor(rng() * TREES.length)], x: cx, h, flip: rng() < 0.5, ...extra });
  const seamTree = (cx) => { tree(cx + (rng() - 0.5) * 20, 95 + rng() * 75); if (rng() < 0.6) tree(cx + 25 + rng() * 25, 60 + rng() * 40); };
  const fence = (tiles, th = FENCE.h * FRONT_SCALE) => {
    const f0 = x;
    for (let t = 0; t < tiles; t++) { const fw = th * ART[FENCE.k].ar; items.push({ k: FENCE.k, x: x + fw / 2, h: th, w: fw }); x += fw; }
    return [f0, x];
  };
  let prevKey = null;
  for (const k of FRONT_ORDER) {
    if (k === 'b0017') {                       // короткий участок забора с деревьями
      if (!ART[FENCE.k]) continue;
      const [f0, f1] = fence(prevKey === 'b0030' ? 5 : 2);   // после 0030 — длинный участок
      for (let t = f0 + (prevKey === 'b0030' ? 110 : 40); t < f1; t += 70 + rng() * 40) tree(t, 70 + rng() * 80);
      prevKey = k; continue;
    }
    if (k === 'park') {                        // одно здание в настоящий размер (Матенадаран), над ним видна гора
      const pk = PARK_BUILDING.k;
      if (!ART[pk]) { prevKey = k; continue; }
      const ph = PARK_BUILDING.h * FRONT_SCALE, pw = ph * ART[pk].ar;
      seamTree(x);
      parkX0 = x;
      items.push({ k: pk, x: x + pw / 2, h: ph, w: pw, depth: 0 });
      x += pw; parkX1 = x;
      prevKey = pk; continue;
    }
    if (!ART[k]) continue;
    const d = DEPTH[k] ?? 0;
    const h = heightOf(k) * FRONT_SCALE * (1 + d * DEPTH_SCALE);
    const bw = h * ART[k].ar;
    if (d < 0) x -= bw * 0.07;                  // дальнее здание чуть заходит за соседей
    const left = x;
    items.push({ k, x: left + bw / 2, h, w: bw, depth: d });
    x += bw;
    if (d < 0) x -= bw * 0.07;
    if (k === 'b0010') cascadeX = left + bw / 2;
    if (prevKey !== 'b0017' && prevKey !== 'park' && prevKey !== 'b0030' && k !== 'b0010') seamTree(left);
    prevKey = k;
  }
  // скорость ряда — чтобы Каскад оказался в кадре у финиша
  if (cascadeX !== null) ROW_K.mid = Math.max(0.28, (cascadeX - 175) / (TRACK.length - 70));
  const cascadeItem = items.find((it) => it.k === 'b0010');
  PARK.x0 = parkX0; PARK.x1 = parkX1;
  // по краям парка — высокие тополя, они прикрывают края «окна» на гору
  const poplars = TREES.filter((t) => t.startsWith('tree_p'));
  if (parkX1 > parkX0 && poplars.length) for (const px of [parkX0 - 4, parkX1 + 4]) trees.push({ k: poplars[Math.floor(rng() * poplars.length)], x: px, h: 165 + rng() * 30, flip: rng() < 0.5 });
  // за Каскадом — небольшая площадь с низкими деревьями: сквозь неё виден обелиск в заднем ряду
  for (let t = x + 15; t < x + 110; t += 45) tree(t, 30 + rng() * 20, { low: true });
  x += 120;
  // после Каскада зданий больше нет — только низкие деревья
  for (let t = x + 160; t < x + 1500; t += 70 + rng() * 60) tree(t, 30 + rng() * 25, { low: true });
  return { items, trees, cascadeX, cascadeW: cascadeItem?.w ?? 0 };
}

function layoutBack() {
  const rng = mulberry(777);
  const shuffle = (arr) => { const r = arr.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
  const k = ROW_K.back;
  const items = [], trees = [];
  const end = TRACK.length * k + 2500;
  let x = -400, placedMother = false;
  // правая граница Каскада в координатах заднего ряда (на финише) — дальше зданий нет
  const camF = TRACK.length - 70;
  const cutoff = rows.mid?.cascadeX != null ? camF * k + (rows.mid.cascadeX - camF * ROW_K.mid) + rows.mid.cascadeW / 2 : Infinity;
  outer: while (x < end) {
    for (const key of shuffle(BACK)) {
      if (!ART[key]) continue;
      const h = 125 + rng() * 60, w = h * ART[key].ar;
      if (x + w * 0.5 > cutoff) break outer;
      items.push({ k: key, x: x + w / 2, h, w });
      // небольшие деревья в заднем ряду — чуть больше, чем раньше
      if (rng() < 0.55) trees.push({ k: TREES[Math.floor(rng() * TREES.length)], x: x + rng() * w, h: 60 + rng() * 50, flip: rng() < 0.5 });
      x += w - (6 + rng() * 14);
      if (!placedMother && x > end * 0.25 && ART.s0022) { items.push({ k: 's0022', x: x + 70, h: 250, w: 250 * ART.s0022.ar }); x += 250 * ART.s0022.ar - 10; placedMother = true; }
      if (x >= end) break;
    }
  }
  // обелиск s0024 — сразу за Каскадом, в заднем ряду (у финиша он справа от Каскада)
  if (ART.s0024 && rows.mid?.cascadeX != null) {
    const bx = camF * k + (rows.mid.cascadeX - camF * ROW_K.mid) + rows.mid.cascadeW / 2 + 16;
    items.push({ k: 's0024', x: bx, h: 235, w: 240 * ART.s0024.ar, top: true });
  }
  return { items, trees };
}

// Экранные границы парка (окно на гору) для текущего кадра.
function parkWindow(s, camX) {
  if (!(PARK.x1 > PARK.x0)) return null;
  const off = camX * ROW_K.mid;
  return [(PARK.x0 - off) * s + 6 * s, (PARK.x1 - off) * s - 6 * s];
}
// Окно на гору: поверх дальних рядов заново рисуем небо и Арарат там, где сейчас парк,
// с плавными краями (без резких обрезов). Рисуем в отдельный холст и растушёвываем маской.
let parkCanvas = null;
function drawParkView(ctx, view, camX) {
  const { w, s, groundY, dpr } = view;
  const win = parkWindow(s, camX);
  if (!win) return;
  const feather = 60 * s;
  const x0 = Math.max(0, win[0] - feather), x1 = Math.min(w, win[1] + feather);
  if (x1 <= x0) return;
  const cw = Math.ceil(w * dpr), ch = Math.ceil(groundY * dpr);
  parkCanvas ??= document.createElement('canvas');
  if (parkCanvas.width !== cw || parkCanvas.height !== ch) { parkCanvas.width = cw; parkCanvas.height = ch; }
  const g = parkCanvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.clearRect(0, 0, w, groundY);
  const sky = g.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, C.skyTop); sky.addColorStop(1, C.skyLow);
  g.fillStyle = sky; g.fillRect(x0, 0, x1 - x0, groundY);
  if (ART.mountain) drawArt(g, 'mountain', w * 0.58 - camX * 0.02 * s, groundY - 95 * s, 165 * s);
  // атмосферный город под горой — сплошные простые дома, без голубой пустоты
  const unit = 38, lk = 0.12, loff = camX * lk;
  for (let i = Math.floor((loff + x0 / s) / unit) - 1; (i * unit - loff) * s < x1 + unit * s; i++) {
    const bx = (i * unit - loff) * s;
    const bh = (78 + h01(i, 31) * 50 + (h01(i, 32) < 0.15 ? 30 : 0)) * s;
    g.fillStyle = h01(Math.floor(i / 2), 33) < 0.5 ? C.cityFar : C.cityFar2;
    g.fillRect(bx, groundY - bh, unit * s + 1, bh);
    g.fillStyle = C.cityWin;
    for (let wy = 12 * s; wy < bh - 8 * s; wy += 14 * s) for (let wx = 6 * s; wx < (unit - 6) * s; wx += 11 * s) g.fillRect(bx + wx, groundY - bh + wy, 4.5 * s, 6 * s);
  }
  // маска с мягкими краями
  g.globalCompositeOperation = 'destination-in';
  const m = g.createLinearGradient(win[0] - feather, 0, win[1] + feather, 0);
  const span = (win[1] - win[0]) + 2 * feather, f = Math.min(0.45, feather / span);
  m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(f, 'rgba(0,0,0,1)');
  m.addColorStop(1 - f, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, w, groundY);
  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(parkCanvas, 0, 0, cw, ch, 0, 0, w, groundY);
}

function drawRow(ctx, { w, s, groundY }, camX, kind) {
  if (!ART.b0001) return;
  rows.mid ??= layoutMid();                    // первый ряд считается первым: он задаёт парк
  if (kind === 'back') rows.back ??= layoutBack();
  const row = rows[kind];
  const off = camX * ROW_K[kind];
  const vis = (it) => { const sx = (it.x - off) * s; return sx + it.w * s / 2 >= 0 && sx - it.w * s / 2 <= w ? sx : null; };

  if (kind === 'back') {
    const by = groundY - 6 * s;
    for (const it of row.items) { if (it.top) continue; const sx = vis(it); if (sx !== null) drawArt(ctx, it.k, sx, by, it.h * s, 1, true); }
    for (const it of row.items) { if (!it.top) continue; const sx = vis(it); if (sx !== null) drawArt(ctx, it.k, sx, by, it.h * s); }   // обелиск — чётко
    for (const t of row.trees) { const sx = (t.x - off) * s; if (sx > -150 && sx < w + 150) drawArt(ctx, t.k, sx, by + 2 * s, t.h * s, 1, true, t.flip); }
    return;
  }
  // мостовая площади под зданиями
  ctx.fillStyle = C.street; ctx.globalAlpha = 0.85;
  ctx.fillRect(0, groundY - PLAZA * s, w, PLAZA * s);
  ctx.globalAlpha = 1;
  // по глубине: сначала дальние, потом средние, потом ближние
  for (const d of [-1, 0, 1]) {
    for (const it of row.items) {
      if ((it.depth ?? 0) !== d) continue;
      const sx = vis(it); if (sx === null) continue;
      const by = groundY - (2 + (d < 0 ? DEPTH_LIFT : d > 0 ? -1 : 0)) * s;
      drawArt(ctx, it.k, sx, by, it.h * s);
      if (d < 0) drawArt(ctx, it.k, sx, by, it.h * s, it.low ? 0.5 : 0.25, true);   // лёгкая дымка
    }
  }
  for (const t of row.trees) {
    const sx = (t.x - off) * s;
    if (sx < -200 * s || sx > w + 200 * s) continue;
    drawArt(ctx, t.k, sx, groundY, t.h * s, 1, false, t.flip);
  }
}

// Сплошной минималистичный горизонт; на участке парка — низкий, чтобы открыть гору.
function drawSkyline(ctx, { w, s, groundY }, camX) {
  if (!ART.b0001) return;
  rows.mid ??= layoutMid();
  const unit = 46, k = 0.08;
  const off = camX * k;
  skylineBody(ctx, w, s, groundY, off, unit);
}
function skylineBody(ctx, w, s, groundY, off, unit) {
  let hPrev = 0;
  for (let i = Math.floor(off / unit) - 3; (i * unit - off) * s < w + unit * s; i++) {
    const same = h01(i, 11) < 0.45;
    let bh = same && hPrev ? hPrev : 120 + h01(i, 12) * 140 + (h01(i, 13) < 0.12 ? 70 : 0);
    hPrev = bh;
    const lx = i * unit;
    const x = (lx - off) * s, bw = unit * s + 1;
    ctx.fillStyle = h01(Math.floor(i / 2), 14) < 0.5 ? C.cityFar : C.cityFar2;
    ctx.fillRect(x, groundY - bh * s, bw, bh * s);
    ctx.fillStyle = C.cityWin;
    for (let wy = 14; wy < bh - 10; wy += 16) for (let wx = 8; wx < unit - 6; wx += 12) ctx.fillRect(x + wx * s, groundY - (bh - wy) * s, 5 * s, 7 * s);
    if (bh > 80 && h01(i, 15) < 0.15) { ctx.fillStyle = C.cityFar2; ctx.fillRect(x + unit * 0.4 * s, groundY - (bh + 16) * s, 2 * s, 16 * s); }
  }
}

function drawArarat(ctx, { w, s, groundY }, camX) {
  const base = groundY - 30 * s;
  const ox = w * 0.55 - (camX * 0.03 * s) % (w * 2);
  ctx.save(); ctx.translate(ox, base); ctx.scale(1.2, 1.2); ctx.translate(-ox, -base);
  ctx.fillStyle = C.ararat;
  ctx.beginPath();
  ctx.moveTo(ox - 330 * s, base);
  ctx.lineTo(ox - 10 * s, base - 210 * s);     // Масис
  ctx.lineTo(ox + 40 * s, base - 200 * s);
  ctx.lineTo(ox + 150 * s, base - 120 * s);
  ctx.lineTo(ox + 215 * s, base - 140 * s);    // Сис
  ctx.lineTo(ox + 360 * s, base);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.snow;
  ctx.beginPath();
  ctx.moveTo(ox - 75 * s, base - 162 * s); ctx.lineTo(ox - 10 * s, base - 210 * s); ctx.lineTo(ox + 40 * s, base - 200 * s);
  ctx.lineTo(ox + 82 * s, base - 168 * s); ctx.lineTo(ox + 40 * s, base - 175 * s); ctx.lineTo(ox + 5 * s, base - 165 * s);
  ctx.lineTo(ox - 30 * s, base - 172 * s); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(ox + 192 * s, base - 125 * s); ctx.lineTo(ox + 215 * s, base - 140 * s); ctx.lineTo(ox + 240 * s, base - 124 * s);
  ctx.lineTo(ox + 215 * s, base - 128 * s); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawCity(ctx, { w, s, groundY }, camX, k, color, minH, minW, maxH, seed) {
  const unit = 70;
  const off = camX * k;
  const first = Math.floor(off / unit) - 1;
  ctx.fillStyle = color;
  for (let i = first; (i * unit - off) * s < w + unit * s; i++) {
    if (h01(i, seed + 3) < (seed === 2 ? 0.45 : 0.3)) continue; // промежутки между домами
    const bw = minW + h01(i, seed) * 40;
    const bh = minH + h01(i, seed + 7) * (maxH - minH);
    const x = (i * unit - off) * s;
    ctx.fillRect(x, groundY - bh * s, bw * s, bh * s);
    if (seed === 2) {
      // окна ближних домов — арочные, как в ереванском туфе
      ctx.fillStyle = C.window;
      for (let wy = 24; wy < bh - 20; wy += 34) for (let wx = 12; wx < bw - 16; wx += 22) {
        const px = x + wx * s, py = groundY - (bh - wy) * s;
        ctx.beginPath(); ctx.moveTo(px, py + 16 * s); ctx.lineTo(px, py + 5 * s);
        ctx.arc(px + 5 * s, py + 5 * s, 5 * s, Math.PI, 0); ctx.lineTo(px + 10 * s, py + 16 * s); ctx.fill();
      }
      ctx.fillStyle = color;
    }
  }
}

function drawCascade(ctx, { w, s, groundY }, camX) {
  // Каскад — ступенчатый силуэт, повторяется вдали
  const k = 0.2, period = 2600;
  const off = camX * k;
  for (let n = Math.floor(off / period) - 1; ((n * period + 900) - off) * s < w + 400 * s; n++) {
    const x0 = ((n * period + 900) - off) * s;
    ctx.fillStyle = C.tuffFar;
    ctx.globalAlpha = 1;
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(x0 + i * 46 * s, groundY - (40 + i * 34) * s, 54 * s, (40 + i * 34) * s);
    }
    ctx.fillStyle = C.tuff; ctx.globalAlpha = 0.5;
    for (let i = 0; i < 6; i++) ctx.fillRect(x0 + i * 46 * s, groundY - (40 + i * 34) * s, 54 * s, 6 * s);
    ctx.globalAlpha = 1;
  }
}

// Финиш: две стойки, длинная лента-баннер с логотипом Panatsea и финишная ленточка.
function drawFinish(ctx, x, Y, s) {
  const span = 300;                                 // ширина финиша (ед. мира)
  ctx.strokeStyle = C.logo; ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, Y(0)); ctx.lineTo(x, Y(230)); ctx.moveTo(x + span * s, Y(0)); ctx.lineTo(x + span * s, Y(230)); ctx.stroke();
  // баннер
  const bx = x - 14 * s, bw = (span + 28) * s, by = Y(232), bh = 46 * s;
  ctx.fillStyle = C.white; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = C.accent; ctx.fillRect(bx, by, bw, 5 * s); ctx.fillRect(bx, by + bh - 5 * s, bw, 5 * s);
  if (ART.logo) {
    const lh = 24 * s, lw = lh * ART.logo.ar;
    ctx.drawImage(ART.logo.c, bx + (bw - lw) / 2, by + (bh - lh) / 2, lw, lh);
  } else {
    ctx.fillStyle = C.logo; ctx.font = `700 ${22 * s}px "Noto Sans Armenian", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Panatsea', bx + bw / 2, by + bh / 2);
  }
  // финишная ленточка на уровне груди
  ctx.strokeStyle = C.coral; ctx.lineWidth = 4 * s;
  ctx.beginPath(); ctx.moveTo(x, Y(92)); ctx.quadraticCurveTo(x + span * s / 2, Y(84), x + span * s, Y(92)); ctx.stroke();
  // клетчатая линия на земле
  for (let i = 0; i < 15; i++) { ctx.fillStyle = i % 2 ? C.logo : C.white; ctx.fillRect(x + i * 20 * s, Y(0), 20 * s, 6 * s); }
}

const OB_SCALE = { bollard: 1.12, bench: 1.25, bins: 1.15, car: 1.12 };
function drawObstacle(ctx, o, X, Y, s, wasHit) {
  if (o.v && ART[o.v]) {
    drawArt(ctx, o.v, X(o.x + o.w / 2), Y(0) + 3 * s, o.h * (OB_SCALE[o.k] ?? 1.1) * s);
    return;
  }
  const x = X(o.x), y0 = Y(0), ww = o.w * s, hh = o.h * s;
  ctx.globalAlpha = wasHit ? 0.45 : 1;
  if (o.k === 'puddle') {
    ctx.fillStyle = C.sky; ctx.globalAlpha *= 0.7;
    ctx.beginPath(); ctx.ellipse(x + ww / 2, y0 + 2 * s, ww / 2, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.white; ctx.globalAlpha = wasHit ? 0.3 : 0.7;
    ctx.beginPath(); ctx.ellipse(x + ww * 0.35, y0, ww * 0.12, 2 * s, 0, 0, Math.PI * 2); ctx.fill();
  } else if (o.k === 'curb') {
    // столбик-боллард
    ctx.fillStyle = C.logo; ctx.fillRect(x, y0 - hh, ww, hh);
    ctx.fillStyle = C.yellow; ctx.fillRect(x, y0 - hh + 6 * s, ww, 6 * s);
    ctx.beginPath(); ctx.arc(x + ww / 2, y0 - hh, ww / 2, Math.PI, 0); ctx.fillStyle = C.logo; ctx.fill();
  } else if (o.k === 'bench') {
    ctx.fillStyle = C.logo;
    ctx.fillRect(x + 6 * s, y0 - hh * 0.55, 5 * s, hh * 0.55); ctx.fillRect(x + ww - 11 * s, y0 - hh * 0.55, 5 * s, hh * 0.55);
    ctx.fillStyle = C.coral;
    ctx.fillRect(x, y0 - hh * 0.62, ww, 7 * s);
    ctx.fillRect(x + 4 * s, y0 - hh, ww - 8 * s, 7 * s);
    ctx.fillStyle = C.logo; ctx.fillRect(x + 6 * s, y0 - hh, 4 * s, hh * 0.4); ctx.fillRect(x + ww - 10 * s, y0 - hh, 4 * s, hh * 0.4);
  } else if (o.k === 'barrier') {
    // высокий дорожный барьер — только двойным прыжком
    ctx.fillStyle = C.logo; ctx.fillRect(x + ww * 0.35, y0 - hh, ww * 0.3, hh);
    const bw = ww * 2.2, bx = x - (bw - ww) / 2;
    for (let i = 0; i < 2; i++) {
      const by = y0 - hh + i * 40 * s;
      ctx.fillStyle = C.white; ctx.fillRect(bx, by, bw, 16 * s);
      ctx.fillStyle = C.coral;
      for (let j = 0; j < 4; j++) ctx.fillRect(bx + j * bw / 4, by, bw / 8, 16 * s);
    }
  }
  ctx.globalAlpha = 1;
}

export function drawCup(ctx, cx, cy, s, f, scale = 1) {
  const [body, accent] = C.cups[f];
  const k = s * scale;
  const tw = 30 * k, bw = 24 * k, hh = 22 * k;
  const top = cy - hh / 2, bot = cy + hh / 2;
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(cx - tw / 2, top); ctx.lineTo(cx + tw / 2, top); ctx.lineTo(cx + bw / 2, bot); ctx.lineTo(cx - bw / 2, bot); ctx.closePath(); ctx.fill();
  ctx.fillStyle = accent; ctx.fillRect(cx - tw * 0.36, cy - 2 * k, tw * 0.72, 6 * k);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(cx, top, tw / 2 + 1.5 * k, 4 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.white; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.ellipse(cx, top - 0.5 * k, tw / 2 - 2 * k, 2.4 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

// Бегун — в runner.js (анимация по ключевым позам цикла бега).
export function drawRunner(ctx, cx, footY, s, st, runner) {
  drawRunnerFigure(ctx, C, cx, footY, s, st, runner);
}
