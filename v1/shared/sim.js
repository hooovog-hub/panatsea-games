// Детерминированная симуляция забега. Один и тот же код работает в браузере
// (игра) и на сервере (проверка результата повтором тапов).
// Никаких Math.random и времени: только номер тика и список тапов.

import { TRACK } from './track.js';

export const TPS = 60;                 // тиков в секунду
export const DT = 1 / TPS;

export const P = {
  baseSpeed: 270,      // ед./с
  gravity: 1900,
  jumpV: 700,
  doubleV: 600,
  runnerW: 24,
  runnerH: 70,
  runnerX0: 0,
  hitEnergy: 30,
  cupEnergy: 8,
  hitBoost: -140,       // замедление при столкновении
  cupBoost: 35,        // ускорение за йогурт
  maxBoost: 120,
  boostDecay: 30,      // ед./с² — ускорение плавно гаснет
  boostRecover: 50,    // ед./с² — замедление плавно проходит
  invulnTicks: 48,
  cupR: 16,
  maxTicks: TPS * 120, // забег дольше 2 минут не считается
};

export function createState() {
  return {
    tick: 0,
    x: P.runnerX0,
    y: 0,
    vy: 0,
    jumps: 0,          // 0 на земле, 1 после прыжка, 2 после второго
    boost: 0,
    energy: 100,
    invuln: 0,
    hit: new Uint8Array(TRACK.obstacles.length),
    got: new Uint8Array(TRACK.cups.length),
    nextOb: 0,         // индекс первого препятствия, которое ещё впереди
    nextCup: 0,
    cupsTaken: 0,
    hits: 0,
    status: 'run',     // run | finish | out
    finishTick: 0,
  };
}

export function speed(s) {
  return P.baseSpeed + s.boost;
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

  // скорость
  if (s.boost > 0) s.boost = Math.max(0, s.boost - P.boostDecay * DT);
  else if (s.boost < 0) s.boost = Math.min(0, s.boost + P.boostRecover * DT);
  s.x += speed(s) * DT;

  // вертикаль
  if (s.jumps > 0 || s.y > 0) {
    s.vy -= P.gravity * DT;
    s.y += s.vy * DT;
    if (s.y <= 0) { s.y = 0; s.vy = 0; s.jumps = 0; ev.push({ t: 'land' }); }
  }
  if (s.invuln > 0) s.invuln--;

  const rx0 = s.x, rx1 = s.x + P.runnerW, ry0 = s.y, ry1 = s.y + P.runnerH;

  // препятствия
  const obs = TRACK.obstacles;
  while (s.nextOb < obs.length && obs[s.nextOb].x + obs[s.nextOb].w < rx0) s.nextOb++;
  for (let i = s.nextOb; i < obs.length; i++) {
    const o = obs[i];
    if (o.x > rx1) break;
    if (s.hit[i] || s.invuln > 0) continue;
    if (rx1 > o.x && rx0 < o.x + o.w && ry0 < o.h) {
      s.hit[i] = 1;
      s.hits++;
      s.energy = Math.max(0, s.energy - P.hitEnergy);
      s.boost = P.hitBoost;
      s.invuln = P.invulnTicks;
      ev.push({ t: 'hit', i });
    }
  }

  // йогурты
  const cups = TRACK.cups;
  while (s.nextCup < cups.length && cups[s.nextCup].x + P.cupR < rx0) s.nextCup++;
  for (let i = s.nextCup; i < cups.length; i++) {
    const c = cups[i];
    if (c.x - P.cupR > rx1) break;
    if (s.got[i]) continue;
    if (rx1 > c.x - P.cupR && rx0 < c.x + P.cupR && ry1 > c.y - P.cupR && ry0 < c.y + P.cupR) {
      s.got[i] = 1;
      s.cupsTaken++;
      s.energy = Math.min(100, s.energy + P.cupEnergy);
      s.boost = Math.min(Math.max(s.boost, 0) + P.cupBoost, P.maxBoost);
      ev.push({ t: 'cup', i });
    }
  }

  if (s.energy <= 0) { s.status = 'out'; ev.push({ t: 'out' }); }
  else if (s.x >= TRACK.length) { s.status = 'finish'; s.finishTick = s.tick; ev.push({ t: 'finish' }); }
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
  return {
    status: s.status,
    ticks: s.status === 'finish' ? s.finishTick : s.tick,
    timeSec: (s.status === 'finish' ? s.finishTick : s.tick) / TPS,
    cups: s.cupsTaken,
    hits: s.hits,
    energy: s.energy,
  };
}
