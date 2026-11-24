// Иллюстрации из assets/Buildings and details и assets/products-cartoon (веб-копии — public/art/*.webp).
// При загрузке:
//  • чистим полупрозрачный «мусорный» фон и обрезаем пустые поля;
//  • деревья с листов вырезаем ПО КОНТУРУ: каждое дерево — отдельный связный объект;
//  • мягко сводим цвета: оттенки остаются разными, но получают общую воздушную дымку.

// Порядок размеров — от владельца (24.11.2026), от самого маленького к самому большому.
// b0030 и памятники в его списке не было — b0030 ставим в середину.
const SIZE_ORDER = ['b0012', 'b0016', 'b0011', 'b0005', 'b0019', 'b0020', 'b0009', 'b0008', 'b0007',
  'b0002', 'b0003', 'b0001', 'b0004', 'b0006', 'b0013', 'b0018', 'b0010'];
export const BUILDINGS = SIZE_ORDER.map((k, i) => ({ k, h: Math.round(105 + i * 9.5) }));
BUILDINGS.splice(8, 0, { k: 'b0030', h: 178 });
export const STATUES = [{ k: 's0022', h: 270 }, { k: 's0023', h: 140 }, { k: 's0024', h: 290 }];
// Первый ряд — порядок от владельца (вариант 3, 24.11.2026).
// 'b0017' — участок забора; 'park' — парк, где открывается вид на Арарат; 's…' — памятник.
// 16 и 12 — в середине после 6. 9, 13, 19 — в заднем ряду; 18 — только в заднем ряду.
export const FRONT_ORDER = ['b0030', 'b0017', 'b0020', 'b0007', 'b0001', 'b0003', 's0023', 'b0011', 'b0005',
  'b0006', 'b0016', 'b0012', 'park', 's0024', 'b0002', 'b0008', 'b0004', 'b0010'];
// Здания, отодвинутые вглубь (меньше, выше на экране, в дымке) — так ряд не стоит на одной линии.
export const SETBACK = new Set(['b0001', 'b0011', 'b0006', 'b0008', 'b0012']);
export const FENCE = { k: 'b0017', h: 58 };          // забор — повторяется как паттерн
// Жилые/обычные дома для второго ряда (заполняют фон).
// 0018, 0011, 0005 — чаще всего (просьба владельца); Мать-Армения (s0022) — один раз, в заднем ряду.
export const BACK = ['b0018', 'b0011', 'b0005', 'b0018', 'b0013', 'b0011', 'b0005', 'b0018', 'b0009', 'b0019', 'b0011', 'b0005', 'b0013', 'b0009'];
// Деревья: отдельные файлы + вырезанные из листов (заполняется при загрузке).
export const TREES = [];
// Стаканчики: f = 0 манго-чиа p12, 1 банан-клубника p13, 2 фисташка p14.
export const CUPS = ['cup_p12', 'cup_p13', 'cup_p14'];

// Сила «сведения» цвета: дальше — сильнее дымка.
const GRADE = {
  mountain: { sat: 0.45, tint: 0.5 },
  building: { sat: 0.72, tint: 0.28 },
  near: { sat: 0.88, tint: 0.06 },
  tree: { sat: 0.82, tint: 0.12 },
  cup: { sat: 1, tint: 0 },
};
const FILES = [
  ...BUILDINGS.map((b) => [b.k, 'building']),
  ...STATUES.map((b) => [b.k, 'building']),
  [FENCE.k, 'building'],
  ['tree_s1', 'tree'], ['tree_s2', 'tree'], ['tree_s3', 'tree'],
  ['mountain', 'mountain'],
  ['lamp', 'near'], ['bollard', 'near'], ['bench', 'near'], ['bench_sleeper', 'near'],
  ['bins', 'near'], ['car_niva', 'near'], ['car_lada', 'near'],
  ...CUPS.map((k) => [k, 'cup']),
];
const SHEETS = ['treesheet_w', 'treesheet_p'];   // листы с несколькими деревьями

export const ART = {};   // ключ → { c, far, w, h, ar }

const CUT = 60;          // ниже этой прозрачности пиксель считаем фоном

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

function pixels(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return { cv, g, w, h, id: g.getImageData(0, 0, w, h) };
}

// Белый фон, связанный с краем картинки, делаем прозрачным (для стаканчиков без альфы).
function clearWhiteBackground(d, w, h) {
  const seen = new Uint8Array(w * h), st = [];
  const white = (p) => d[p * 4 + 3] > 0 && d[p * 4] > 238 && d[p * 4 + 1] > 238 && d[p * 4 + 2] > 238;
  for (let x = 0; x < w; x++) { st.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { st.push(y * w, y * w + w - 1); }
  while (st.length) {
    const p = st.pop();
    if (seen[p]) continue; seen[p] = 1;
    if (!white(p) && d[p * 4 + 3] >= CUT) continue;
    d[p * 4 + 3] = 0;
    const x = p % w;
    if (x > 0) st.push(p - 1); if (x < w - 1) st.push(p + 1);
    if (p >= w) st.push(p - w); if (p < w * (h - 1)) st.push(p + w);
  }
}

// Готовит объект: d — RGBA-данные исходника (уже очищенные), bbox — область, keep(p) — какие пиксели оставить.
function build(srcCanvas, x0, y0, tw, th, grade, tint) {
  const c = document.createElement('canvas'); c.width = tw; c.height = th;
  const o = c.getContext('2d');
  o.filter = grade.sat < 1 ? `saturate(${grade.sat}) sepia(0.08)` : 'none';
  o.drawImage(srcCanvas, x0, y0, tw, th, 0, 0, tw, th);
  o.filter = 'none';
  if (grade.tint > 0) {
    o.globalCompositeOperation = 'source-atop';
    o.globalAlpha = grade.tint; o.fillStyle = tint; o.fillRect(0, 0, tw, th);
  }
  const far = document.createElement('canvas'); far.width = tw; far.height = th;
  const f = far.getContext('2d');
  f.drawImage(c, 0, 0);
  f.globalCompositeOperation = 'source-atop'; f.globalAlpha = 0.42; f.fillStyle = tint; f.fillRect(0, 0, tw, th);
  return { c, far, w: tw, h: th, ar: tw / th };
}

function prepareSingle(img, grade, tint, whiteBg) {
  const { cv, g, w, h, id } = pixels(img);
  const d = id.data;
  if (whiteBg) clearWhiteBackground(d, w, h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4 + 3;
    if (d[i] < CUT) { d[i] = 0; continue; }
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  g.putImageData(id, 0, 0);
  return build(cv, x0, y0, x1 - x0 + 1, y1 - y0 + 1, grade, tint);
}

// Лист с деревьями → отдельные деревья по контуру.
// Связность ищем на грубой сетке (блоки B×B), чтобы отдельные листочки рядом с кроной
// остались с «своим» деревом. Каждый пиксель достаётся только своему дереву —
// соседние деревья в рамку не попадают.
function cutSheet(img, grade, tint, prefix) {
  const { cv, g, w, h, id } = pixels(img);
  const d = id.data;
  const B = 6, gw = Math.ceil(w / B), gh = Math.ceil(h / B);
  const occ = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4 + 3;
    if (d[i] < CUT) d[i] = 0; else occ[((y / B) | 0) * gw + ((x / B) | 0)] = 1;
  }
  const lab = new Int32Array(gw * gh), comps = [];
  for (let p = 0; p < gw * gh; p++) {
    if (!occ[p] || lab[p]) continue;
    const id2 = comps.length + 1, st = [p]; lab[p] = id2;
    let n = 0, gx0 = gw, gy0 = gh, gx1 = 0, gy1 = 0;
    while (st.length) {
      const q = st.pop(); n++;
      const qx = q % gw, qy = (q / gw) | 0;
      if (qx < gx0) gx0 = qx; if (qx > gx1) gx1 = qx; if (qy < gy0) gy0 = qy; if (qy > gy1) gy1 = qy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const r = ny * gw + nx;
        if (occ[r] && !lab[r]) { lab[r] = id2; st.push(r); }
      }
    }
    comps.push({ id: id2, n, gx0, gy0, gx1, gy1 });
  }
  const big = comps.filter((c) => c.n > (gw * gh) * 0.004);   // мелкие крошки — не деревья
  const out = [];
  for (const c of big) {
    const x0 = c.gx0 * B, y0 = c.gy0 * B;
    const x1 = Math.min(w - 1, (c.gx1 + 1) * B - 1), y1 = Math.min(h - 1, (c.gy1 + 1) * B - 1);
    const tw = x1 - x0 + 1, th = y1 - y0 + 1;
    // только пиксели своего дерева
    const part = g.createImageData(tw, th), pd = part.data;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const sx = x0 + x, sy = y0 + y;
      if (lab[((sy / B) | 0) * gw + ((sx / B) | 0)] !== c.id) continue;
      const si = (sy * w + sx) * 4, di = (y * tw + x) * 4;
      pd[di] = d[si]; pd[di + 1] = d[si + 1]; pd[di + 2] = d[si + 2]; pd[di + 3] = d[si + 3];
    }
    const pc = document.createElement('canvas'); pc.width = tw; pc.height = th;
    pc.getContext('2d').putImageData(part, 0, 0);
    out.push(build(pc, 0, 0, tw, th, grade, tint));
  }
  out.forEach((a, i) => { const k = `${prefix}${i + 1}`; ART[k] = a; TREES.push(k); });
}

export async function loadArt(tint, onProgress) {
  let done = 0;
  const total = FILES.length + SHEETS.length;
  const tick = () => onProgress?.(++done / total);
  await Promise.all([
    ...FILES.map(async ([k, grade]) => {
      try {
        const img = await loadImage(`art/${k}.webp`);
        ART[k] = prepareSingle(img, GRADE[grade], tint, grade === 'cup');
        if (k.startsWith('tree_')) TREES.push(k);
      } catch { /* без картинки будет запасной вариант */ }
      tick();
    }),
    ...SHEETS.map(async (k) => {
      try { cutSheet(await loadImage(`art/${k}.webp`), GRADE.tree, tint, k === 'treesheet_w' ? 'tree_w' : 'tree_p'); } catch {}
      tick();
    }),
  ]);
  TREES.sort();
  try { const logo = await loadImage('assets/logo/panatsea-logo.svg'); ART.logo = { c: logo, far: logo, ar: logo.naturalWidth / logo.naturalHeight || 6.33 }; } catch {}
}

// Рисует картинку с нижним центром в (cx, by) высотой hpx.
export function drawArt(ctx, k, cx, by, hpx, alpha = 1, useFar = false, flip = false) {
  const a = ART[k]; if (!a) return 0;
  const wpx = hpx * a.ar;
  ctx.globalAlpha = alpha;
  const img = useFar ? a.far : a.c;
  if (flip) {
    ctx.save(); ctx.translate(cx, 0); ctx.scale(-1, 1);
    ctx.drawImage(img, -wpx / 2, by - hpx, wpx, hpx);
    ctx.restore();
  } else ctx.drawImage(img, cx - wpx / 2, by - hpx, wpx, hpx);
  ctx.globalAlpha = 1;
  return wpx;
}
