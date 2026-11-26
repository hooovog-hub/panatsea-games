// Детерминированная симуляция забега. Один и тот же код работает в браузере
// (игра) и на сервере (проверка результата повтором тапов).
// Никаких Math.random и времени: только номер тика и список тапов.
//
// Правила (решение владельца 27.11.2026):
//  • очки = 50 за каждый стаканчик протеина − 100 за каждое столкновение;
//  • энергии нет — забег всегда идёт до финиша;
//  • скорость плавно растёт: старт 75% от прежней, финиш 125%.

import { TRACK } from './track.js';

export const TPS = 60;                 // тиков в секунду
export const DT = 1 / TPS;

export const P = {
  baseSpeed: 270,      // прежняя скорость, ед./с
  speedStart: 0.75,    // множитель скорости на старте
  speedEnd: 1.25,      // множитель скорости на финише
  gravity: 1900,
  jumpV: 700,
  doubleV: 600,
  runnerW: 24,
  runnerH: 70,
  runnerX0: 0,
  cupPoints: 50,
  hitPenalty: 100,
  hitBoost: -90,       // кратковременное замедление при столкновении
  cupBoost: 0,         // скорость от стаканчиков больше не зависит
  maxBoost: 0,
  boostRecover: 60,    // ед./с² — замедление плавно проходит
  invulnTicks: 40,
  cupR: 16,
  maxTicks: TPS * 150, // забег дольше 2,5 минут не считается
};

// Пороги призов
export const PRIZE = { yogurtScore: 1500, promoScore: 200 };

export function createState() {
  return {
    tick: 0,
    x: P.runnerX0,
    y: 0,
    vy: 0,
    jumps: 0,          // 0 на земле, 1 после прыжка, 2 после второго
    boost: 0,
    invuln: 0,
    hit: new Uint8Array(TRACK.obstacles.length),
    got: new Uint8Array(TRACK.cups.length),
    nextOb: 0,
    nextCup: 0,
    cupsTaken: 0,
    hits: 0,
    score: 0,
    status: 'run',     // run | finish | out (только если забег слишком долгий)
    finishTick: 0,
  };
}

export const scoreOf = (cups, hits) => cups * P.cupPoints - hits * P.hitPenalty;

// Базовая скорость в точке трассы: от 75% до 125% прежней.
export function baseSpeedAt(x) {
  const p = Math.min(1, Math.max(0, x / TRACK.length));
  return P.baseSpeed * (P.speedStart + (P.speedEnd - P.speedStart) * p);
}

export function speed(s) {
  return Math.max(60, baseSpeedAt(s.x) + s.boost);
}

// Один тик. tap — был ли тап в этом тике. Возвращает массив событий для отрисовки.
export function step(s, tap) {
  const ev = [];
  if (s.status !== 'run') return ev;
  s.tick++;

  if (tap) {
    if (s.jumps === 0) { s.vy = P.jumpV; s.jumps = 1; ev.push({ t: 'jump' }); }
    else if (s.jumps === 1) { s.vy = P.doubleV; s.jumps = 2; ev.push({ t: 'jump2' }); }
  }

  if (s.boost < 0) s.boost = Math.min(0, s.boost + P.boostRecover * DT);
  s.x += speed(s) * DT;

  if (s.jumps > 0 || s.y > 0) {
    s.vy -= P.gravity * DT;
    s.y += s.vy * DT;
    if (s.y <= 0) { s.y = 0; s.vy = 0; s.jumps = 0; ev.push({ t: 'land' }); }
  }
  if (s.invuln > 0) s.invuln--;

  const rx0 = s.x, rx1 = s.x + P.runnerW, ry0 = s.y, ry1 = s.y + P.runnerH;

  const obs = TRACK.obstacles;
  while (s.nextOb < obs.length && obs[s.nextOb].x + obs[s.nextOb].w < rx0) s.nextOb++;
  for (let i = s.nextOb; i < obs.length; i++) {
    const o = obs[i];
    if (o.x > rx1) break;
    if (s.hit[i] || s.invuln > 0) continue;
    if (rx1 > o.x && rx0 < o.x + o.w && ry0 < o.h) {
      s.hit[i] = 1;
      s.hits++;
      s.score = scoreOf(s.cupsTaken, s.hits);
      s.boost = P.hitBoost;
      s.invuln = P.invulnTicks;
      ev.push({ t: 'hit', i, pts: -P.hitPenalty });
    }
  }

  const cups = TRACK.cups;
  while (s.nextCup < cups.length && cups[s.nextCup].x + P.cupR < rx0) s.nextCup++;
  for (let i = s.nextCup; i < cups.length; i++) {
    const c = cups[i];
    if (c.x - P.cupR > rx1) break;
    if (s.got[i]) continue;
    if (rx1 > c.x - P.cupR && rx0 < c.x + P.cupR && ry1 > c.y - P.cupR && ry0 < c.y + P.cupR) {
      s.got[i] = 1;
      s.cupsTaken++;
      s.score = scoreOf(s.cupsTaken, s.hits);
      ev.push({ t: 'cup', i, pts: P.cupPoints });
    }
  }

  if (s.x >= TRACK.length) { s.status = 'finish'; s.finishTick = s.tick; ev.push({ t: 'finish' }); }
  else if (s.tick >= P.maxTicks) { s.status = 'out'; ev.push({ t: 'out' }); }
  return ev;
}

// Повтор забега по тикам тапов (возрастающий список целых чисел).
export function replay(taps) {
  const s = createState();
  let k = 0;
  while (s.status === 'run') {
    const t = s.tick + 1;
    let tap = false;
    while (k < taps.length && taps[k] <= t) { if (taps[k] === t) tap = true; k++; }
    step(s, tap);
  }
  const ticks = s.status === 'finish' ? s.finishTick : s.tick;
  return { status: s.status, ticks, timeSec: ticks / TPS, cups: s.cupsTaken, hits: s.hits, score: s.score };
}
