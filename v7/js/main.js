// Игровой цикл, экраны и связь с сервером.
import { createState, step, DT, TPS, P } from '../shared/sim.js';
import { TRACK } from '../shared/track.js';
import { loadColors, makeView, draw, drawRunner, burst, cupColor } from './render.js';
import { T } from './i18n.hy.js';
import { loadArt } from './art.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');

// ---------- игрок ----------
function playerId() {
  try {
    let id = localStorage.getItem('pn_pid');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('pn_pid', id); }
    return id;
  } catch { return (window.__pid ??= crypto.randomUUID()); }
}
let runner = 'girl';
try { runner = localStorage.getItem('pn_runner') || 'girl'; } catch {}
let targetSec = 50;

// ---------- API ----------
async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'http'), { data });
  return data;
}

// ---------- тексты ----------
document.querySelectorAll('[data-t]').forEach((el) => { const v = T[el.dataset.t]; if (typeof v === 'string') el.textContent = v; });
function setGoal() { $('goal').textContent = T.goal(fmt(targetSec)); $('target').textContent = T.target(fmt(targetSec)); }
const fmt = (n) => (Math.round(n * 10) / 10).toString();

// ---------- выбор бегуна ----------
const demoState = { ...createState(), x: 0 };
function paintRunnerButtons() {
  document.querySelectorAll('.runner-btn').forEach((b) => {
    const r = b.dataset.runner;
    b.setAttribute('aria-pressed', String(r === runner));
    const c = b.querySelector('canvas'); const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    drawRunner(g, 56, 108, 1.25, { ...demoState, y: 0, x: demoState.x + (r === 'boy' ? 19 : 0) }, r);
  });
}
document.querySelectorAll('.runner-btn').forEach((b) => b.addEventListener('click', () => {
  runner = b.dataset.runner;
  try { localStorage.setItem('pn_runner', runner); } catch {}
  paintRunnerButtons();
}));

// ---------- состояние игры ----------
let mode = 'menu';           // menu | count | run | wait | result
let view;
let st = createState();
let taps = [];
let pendingTaps = 0;
let acc = 0;
let last = performance.now();
let token = null;
let online = true;
let flash = 0;

function resize() { view = makeView(canvas); }
window.addEventListener('resize', resize);

function show(id) {
  for (const s of ['screen-start', 'screen-count', 'screen-result']) $(s).hidden = s !== id;
  $('hud').hidden = !(mode === 'run' || mode === 'count' || mode === 'wait');
}

// ---------- ввод ----------
function onTap(e) {
  if (mode !== 'run') return;
  e.preventDefault();
  if (pendingTaps < 2) pendingTaps++;
}
canvas.addEventListener('pointerdown', onTap);
$('screen-count').addEventListener('pointerdown', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    if (mode === 'run') { e.preventDefault(); if (pendingTaps < 2) pendingTaps++; }
  }
});

// ---------- старт ----------
// ---------- музыка ----------
// Фоновая музыка (mp3/music (AA).mp3). Включается по первому касанию «Старт»
// (браузеры не дают играть звук без действия пользователя), играет по кругу.
const music = new Audio('audio/music.mp3');
music.loop = true; music.volume = 0.55; music.preload = 'auto';
let muted = false;
try { muted = localStorage.getItem('pn_muted') === '1'; } catch {}
function paintSound() {
  const b = $('btn-sound'); if (!b) return;
  b.setAttribute('aria-pressed', String(!muted));
  b.innerHTML = muted
    ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>'
    : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  b.setAttribute('aria-label', muted ? 'Միացնել ձայնը' : 'Անջատել ձայնը');
}
function playMusic() { if (!muted) music.play().catch(() => {}); }
$('btn-sound')?.addEventListener('click', (e) => {
  e.stopPropagation();
  muted = !muted;
  try { localStorage.setItem('pn_muted', muted ? '1' : '0'); } catch {}
  if (muted) music.pause(); else playMusic();
  paintSound();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) music.pause(); else if (mode !== 'menu') playMusic(); });
paintSound();

async function startRun() {
  playMusic();
  const btn = $('btn-start');
  btn.disabled = true; btn.textContent = T.loading;
  token = null; online = true;
  try {
    const r = await api('api/run/start', { playerId: playerId() });
    token = r.token; targetSec = r.targetSec; setGoal();
  } catch {
    online = false;
    if (!window.PN_STATIC) toast(T.offline);
  }
  btn.disabled = false; btn.textContent = T.start;
  st = createState(); taps = []; pendingTaps = 0; acc = 0; flash = 0;
  mode = 'count'; show('screen-count');
  updateHud();
  const seq = ['3', '2', '1', T.go];
  for (const n of seq) {
    const el = $('count'); el.textContent = n; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    await sleep(n === T.go ? 450 : 650);
  }
  $('screen-count').hidden = true;
  mode = 'run'; last = performance.now(); acc = 0;
}
$('btn-start').addEventListener('click', startRun);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- финиш ----------
async function endRun() {
  mode = 'wait';
  const local = { status: st.status, timeSec: (st.status === 'finish' ? st.finishTick : st.tick) / TPS, cups: st.cupsTaken };
  await sleep(st.status === 'finish' ? 700 : 900);
  if (st.status === 'out') return showResult({ outcome: 'out', ...local });
  if (!online || !token) return showResult({ outcome: 'offline', ...local });
  try {
    const r = await api('api/run/finish', { token, playerId: playerId(), taps });
    showResult(r);
  } catch (e) {
    showResult({ outcome: e.data?.error === 'rejected' ? 'rejected' : 'offline', ...local });
  }
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function codeBlock(label, code) {
  return `<div class="code-label">${esc(label)}</div>
    <div class="code" id="code">${esc(code)}</div>
    <button class="copy" id="copy">${esc(T.copy)}</button>`;
}

function showResult(r) {
  mode = 'result';
  const time = r.timeSec != null ? fmt(r.timeSec) : '';
  // крупный баннер с протеиновыми йогуртами — в конце каждого забега, чтобы запомнилась этикетка
  let html = `<div class="promo-banner"><img src="${BANNER}" alt="${esc(T.bannerTitle)}">
    <div class="promo-cap"><b>${esc(T.bannerTitle)}</b><span>${esc(T.bannerSub)}</span></div></div>`;
  if (r.outcome === 'out') {
    html += `<h1>${esc(T.outTitle)}</h1><p class="result-text">${esc(T.outText)}</p>`;
  } else {
    html += `<p class="result-time">${esc(T.yourTime(time))}</p>`;
    if (r.outcome === 'yogurt') {
      html += `<h1>${esc(T.winTitle)}</h1>
        <div class="gift"><div class="gift-title">${esc(T.winText(r.qty ?? 2))}</div>${codeBlock(T.codeLabel, r.code)}</div>
        <p class="note">${esc(T.winHow)}</p>`;
    } else if (r.outcome === 'promo') {
      const title = r.reason === 'already_won' ? T.promoTitleWon : r.reason === 'stock_out' ? T.promoTitleStock : T.promoTitleSlow;
      const text = r.reason === 'already_won' ? T.promoTextWon : r.reason === 'stock_out' ? T.promoTextStock : T.promoTextSlow(fmt(r.targetSec ?? targetSec));
      html += `<h1>${esc(title)}</h1><p class="result-text">${esc(text)}</p>
        <div class="gift"><div class="gift-title">${esc(T.promoGift)}</div>${codeBlock(r.repeat ? T.promoRepeat : T.promoLabel, r.code)}</div>
        <a class="btn secondary" style="display:block;text-decoration:none" href="https://panatsea.net" target="_blank" rel="noopener">${esc(T.toSite)}</a>`;
    } else if (r.outcome === 'none') {
      html += `<h1>${esc(T.noneTitle)}</h1><p class="result-text">${esc(T.noneText)}</p>`;
    } else if (r.outcome === 'rejected') {
      html += `<h1>${esc(T.outTitle)}</h1><p class="result-text">${esc(T.rejected)}</p>`;
    } else {
      html += `<div class="result-big">${esc(time)} ${esc(T.sec)}</div><p class="result-text">${esc(T.offline)}</p>`;
    }
  }
  if (r.cups != null) html += `<p class="stats">${esc(T.cups(r.cups))}</p>`;
  html += `<button class="btn primary" id="btn-again" style="margin-top:10px">${esc(T.again)}</button>`;
  $('result').innerHTML = html;
  $('btn-again').addEventListener('click', startRun);
  $('copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('code').textContent); $('copy').textContent = T.copied; } catch {}
  });
  show('screen-result');
}

const BANNER = 'products/trio.webp';   // фото трёх протеиновых йогуртов
const PHOTOS = { 12: 'products/p12.jpg', 13: 'products/p13.jpg', 14: 'products/p14.jpg' };   // настоящие фото продуктов

let toastTimer;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

// ---------- HUD ----------
function updateHud() {
  const e = $('energy');
  e.style.width = st.energy + '%';
  e.classList.toggle('low', st.energy <= 40);
  const t = (st.status === 'finish' ? st.finishTick : st.tick) / TPS;
  const tm = $('timer'); tm.textContent = t.toFixed(1);
  tm.classList.toggle('over', t > targetSec);
  $('progress').style.width = Math.min(100, (st.x / TRACK.length) * 100) + '%';
}

// ---------- цикл ----------
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (mode === 'run') {
    acc += dt;
    while (acc >= DT && st.status === 'run') {
      acc -= DT;
      const tap = pendingTaps > 0;
      if (tap) { pendingTaps--; taps.push(st.tick + 1); }
      for (const ev of step(st, tap)) {
        if (ev.t === 'cup') { const c = TRACK.cups[ev.i]; burst(c.x, c.y, cupColor(c.f)); vibrate(8); }
        if (ev.t === 'hit') { flash = 1; vibrate(40); }
      }
    }
    if (st.status !== 'run') endRun();
    updateHud();
  } else if (mode === 'menu') {
    // заставка: бегун бежит по пустому началу трассы
    demoState.x += 120 * dt;
    if (demoState.x > 560) demoState.x = -40;
    paintRunnerButtons();
  }

  flash = Math.max(0, flash - dt * 3);
  const drawState = mode === 'menu' ? { ...demoState, x: demoState.x - 200, nextOb: 0, nextCup: 0 } : st;
  draw(ctx, view, drawState, runner, dt, { flash });
  requestAnimationFrame(frame);
}

function vibrate(ms) { try { navigator.vibrate?.(ms); } catch {} }

// ---------- запуск ----------
async function boot() {
  await document.fonts?.ready;
  loadColors();
  resize();
  setGoal();
  const btn = $('btn-start');
  btn.disabled = true; btn.textContent = T.loading;
  const tint = getComputedStyle(document.documentElement).getPropertyValue('--pn-ill-haze').trim();
  await loadArt(tint);
  btn.disabled = false; btn.textContent = T.start;
  try { const c = await api('api/config'); targetSec = c.targetSec; setGoal(); } catch { online = false; }
  show('screen-start');
  paintRunnerButtons();
  requestAnimationFrame((t) => { last = t; frame(t); });
}
boot();

// Отладка экранов результата: только при ?debug в адресе.
if (new URLSearchParams(location.search).has('debug')) window.__pn = { showResult };
