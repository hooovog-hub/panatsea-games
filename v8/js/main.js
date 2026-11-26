// Игровой цикл, экраны и связь с сервером. Вариант 8+: очки вместо времени.
//  Правила (решение владельца 27.11.2026): +50 за стаканчик, −100 за столкновение;
//  1500+ → 2 протеиновых йогурта (1 раз в день на номер), 200+ → промокод −50%.
import { createState, step, DT, TPS, P, PRIZE } from '../shared/sim.js';
import { TRACK } from '../shared/track.js';
import { loadColors, makeView, draw, drawRunner, burst, cupColor, popup } from './render.js';
import { T } from './i18n.hy.js';
import { loadArt } from './art.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ---------- номер телефона ----------
// Нормализуем к виду 374XXXXXXXX (Армения). Другие страны — 10–15 цифр как есть.
function normalizePhone(raw) {
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && d.startsWith('0')) d = '374' + d.slice(1);
  if (d.length === 8) d = '374' + d;
  if (/^374\d{8}$/.test(d)) return d;
  if (d.length >= 10 && d.length <= 15 && !d.startsWith('374')) return d;
  return null;
}
const prettyPhone = (d) => (/^374\d{8}$/.test(d) ? `+374 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : `+${d}`);
let phone = store.get('pn_phone');

let runner = store.get('pn_runner') || 'girl';

// ---------- API ----------
async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'http'), { data });
  return data;
}

// ---------- тексты ----------
document.querySelectorAll('[data-t]').forEach((el) => { const v = T[el.dataset.t]; if (typeof v === 'string') el.textContent = v; });
function paintPhoneLine() {
  const b = $('phone-line'); if (!b) return;
  b.hidden = !phone;
  if (phone) b.textContent = T.phoneChange(prettyPhone(phone));
}
$('phone-line')?.addEventListener('click', () => { askPhone(); });

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
  runner = b.dataset.runner; store.set('pn_runner', runner); paintRunnerButtons();
}));

// ---------- состояние игры ----------
let mode = 'menu';           // menu | phone | count | run | wait | result
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
  for (const s of ['screen-start', 'screen-phone', 'screen-count', 'screen-result']) $(s).hidden = s !== id;
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

// ---------- музыка ----------
const music = new Audio('audio/music.mp3');
music.loop = true; music.volume = 0.55; music.preload = 'auto';
let muted = store.get('pn_muted') === '1';
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
  muted = !muted; store.set('pn_muted', muted ? '1' : '0');
  if (muted) music.pause(); else playMusic();
  paintSound();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) music.pause(); else if (mode !== 'menu') playMusic(); });
paintSound();

// ---------- номер перед игрой ----------
function askPhone() {
  mode = 'phone';
  $('phone').value = phone && phone.startsWith('374') ? phone.slice(3) : (phone ?? '');
  $('phone-error').hidden = true;
  show('screen-phone');
  setTimeout(() => $('phone').focus(), 50);
}
$('phone').addEventListener('input', () => { $('phone-error').hidden = true; });
$('phone-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = $('phone').value.trim();
  const n = normalizePhone(raw);
  if (!n) { $('phone-error').textContent = T.phoneBad; $('phone-error').hidden = false; return; }
  phone = n; store.set('pn_phone', phone); paintPhoneLine();
  startRun();
});

// ---------- старт ----------
$('btn-start').addEventListener('click', () => { playMusic(); if (!phone) askPhone(); else startRun(); });

async function startRun() {
  playMusic();
  token = null; online = true;
  try {
    const r = await api('api/run/start', { playerId: phone });
    token = r.token;
  } catch { online = false; }
  st = createState(); taps = []; pendingTaps = 0; acc = 0; flash = 0;
  mode = 'count'; show('screen-count');
  updateHud();
  for (const n of ['3', '2', '1', T.go]) {
    const el = $('count'); el.textContent = n; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    await sleep(n === T.go ? 450 : 650);
  }
  $('screen-count').hidden = true;
  mode = 'run'; last = performance.now(); acc = 0;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- решение о призе ----------
// С сервером решает сервер. Без сервера (тестовая ссылка) — имитация в браузере по тем же правилам.
function localDecide(score) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `pn_${phone}`;
  let rec = {};
  try { rec = JSON.parse(store.get(key) || '{}'); } catch {}
  const code = (p) => `${p}-TEST-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  let out;
  if (score >= PRIZE.yogurtScore && rec.lastWin !== today) { rec.lastWin = today; out = { outcome: 'yogurt', code: code('PY'), qty: 2 }; }
  else if (score >= PRIZE.promoScore) { rec.promos = (rec.promos ?? 0) + 1; out = { outcome: 'promo', code: code('P50'), promoCount: rec.promos, reason: score >= PRIZE.yogurtScore ? 'won_today' : 'score' }; }
  else out = { outcome: 'none' };
  store.set(key, JSON.stringify(rec));
  return { ...out, test: true };
}

async function endRun() {
  mode = 'wait';
  const local = { score: st.score, cups: st.cupsTaken, hits: st.hits };
  await sleep(700);
  if (!online || !token) return showResult({ ...local, ...localDecide(st.score) });
  try {
    const r = await api('api/run/finish', { token, playerId: phone, taps });
    showResult(r);
  } catch (e) {
    showResult({ ...local, outcome: e.data?.error === 'rejected' ? 'rejected' : 'none' });
  }
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function codeBlock(label, code) {
  return `<div class="code-label">${esc(label)}</div>
    <div class="code" id="code">${esc(code)}</div>
    <button class="copy" id="copy">${esc(T.copy)}</button>`;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch {}
  ta.remove(); return ok;
}

function shareBlock(code) {
  const link = location.origin + location.pathname;
  const msg = T.shareMsg(code, link);
  return { html: `<div class="share">
      <div class="share-title">${esc(T.shareTitle)}</div>
      <div class="share-text">${esc(T.shareText)}</div>
      <div class="btn-row">
        <a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${esc(T.shareWa)}</a>
        <button class="btn secondary" id="share-copy">${esc(T.shareCopy)}</button>
      </div></div>`, msg };
}

function showResult(r) {
  mode = 'result';
  const score = r.score ?? st.score;
  let html = `<div class="promo-banner"><img src="${BANNER}" alt="${esc(T.bannerTitle)}">
    <div class="promo-cap"><b>${esc(T.bannerTitle)}</b><span>${esc(T.bannerSub)}</span></div></div>`;
  const head = (title, sub) => `<div class="res-head"><span class="score-chip">${esc(score)} ${esc(T.scoreLabel)}</span>
      <h1>${esc(title)}</h1>${sub ? `<p class="result-text">${esc(sub)}</p>` : ''}</div>`;
  const again = `<button class="btn primary" id="btn-again">${esc(T.again)}</button>`;
  let share = null;
  if (r.outcome === 'yogurt') {
    html += head(T.winTitle2, T.winCall(prettyPhone(phone))) +
      `<div class="gift">${codeBlock(T.codeLabel, r.code)}</div>` + again;
  } else if (r.outcome === 'promo') {
    const sub = r.reason === 'won_today' ? T.wonToday : T.promoNear(Math.max(0, PRIZE.yogurtScore - score));
    html += head(T.promoTitle, sub) +
      `<div class="gift"><div class="gift-title">${esc(T.promoGift)}</div><div class="gift-where">${esc(T.promoWhere)}</div>${codeBlock(T.promoLabel, r.code)}</div>`;
    if ((r.promoCount ?? 1) >= 2) { share = shareBlock(r.code); html += share.html; }   // со второго промокода — «отправь другу»
    html += `<div class="btn-row">${again}<a class="btn secondary" href="https://panatsea.net" target="_blank" rel="noopener">${esc(T.toSite)}</a></div>`;
  } else if (r.outcome === 'rejected') {
    html += head(T.outTitle, T.rejected) + again;
  } else {
    html += head(T.lowTitle, T.lowText) + again;
  }
  if (r.test) html += `<p class="test-note">${esc(T.testMode)}</p>`;
  $('result').innerHTML = html;
  $('btn-again').addEventListener('click', startRun);
  $('copy')?.addEventListener('click', async () => { if (await copyText($('code').textContent)) $('copy').textContent = T.copied; });
  if (share) $('share-copy').addEventListener('click', async () => { if (await copyText(share.msg)) $('share-copy').textContent = T.shareCopied; });
  show('screen-result');
}

const BANNER = 'products/trio.webp';   // фото трёх протеиновых йогуртов

// ---------- HUD ----------
function updateHud() {
  const sc = $('score');
  sc.textContent = st.score;
  sc.classList.toggle('neg', st.score < 0);
  sc.classList.toggle('win', st.score >= PRIZE.yogurtScore);
  $('cups').textContent = T.cupsCount(st.cupsTaken, TRACK.cups.length);
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
        if (ev.t === 'cup') { const c = TRACK.cups[ev.i]; burst(c.x, c.y, cupColor(c.f)); popup(c.x, c.y + 18, '+' + ev.pts, true); vibrate(8); }
        if (ev.t === 'hit') { flash = 1; popup(st.x + P.runnerW / 2, st.y + 90, '−' + Math.abs(ev.pts), false); vibrate(40); }
      }
    }
    if (st.status !== 'run') endRun();
    updateHud();
  } else if (mode === 'menu' || mode === 'phone') {
    demoState.x += 120 * dt;
    if (demoState.x > 560) demoState.x = -40;
    paintRunnerButtons();
  }

  flash = Math.max(0, flash - dt * 3);
  const drawState = (mode === 'menu' || mode === 'phone') ? { ...demoState, x: demoState.x - 200, nextOb: 0, nextCup: 0 } : st;
  draw(ctx, view, drawState, runner, dt, { flash });
  requestAnimationFrame(frame);
}

function vibrate(ms) { try { navigator.vibrate?.(ms); } catch {} }

// ---------- запуск ----------
async function boot() {
  await document.fonts?.ready;
  loadColors();
  resize();
  const btn = $('btn-start');
  btn.disabled = true; btn.textContent = T.loading;
  const tint = getComputedStyle(document.documentElement).getPropertyValue('--pn-ill-haze').trim();
  await loadArt(tint);
  btn.disabled = false; btn.textContent = T.start;
  try { await api('api/config'); } catch { online = false; }
  paintPhoneLine();
  show('screen-start');
  paintRunnerButtons();
  requestAnimationFrame((t) => { last = t; frame(t); });
}
boot();

// Отладка экранов результата: только при ?debug в адресе.
if (new URLSearchParams(location.search).has('debug')) window.__pn = { showResult, setPhone: (p) => { phone = p; } };
