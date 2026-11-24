// Бегун: плоская фигура с анимацией по ключевым позам настоящего цикла бега.
// Углы — в градусах от вертикали вниз, «+» — вперёд (по ходу бега, вправо).
// Колено/локоть — угол нижнего сегмента относительно верхнего.

const D = Math.PI / 180;

// Размеры в единицах мира (бегун ~76 ед. ростом, хитбокс в симуляции — 70).
const THIGH = 18, SHIN = 17, FOOT = 8;
const TORSO = 24, NECK = 4, HEAD = 8;
const UPPER = 12, FORE = 11;

// Цикл одной ноги: фаза 0 — касание земли пяткой впереди.
// 0–0,38 опора (бедро уходит назад), 0,38 — толчок, далее захлёст голени,
// вынос бедра вперёд и выпрямление голени к следующему касанию.
const LEG_KEYS = [
  // фаза, бедро, колено
  [0.00, 30, -10],
  [0.10, 14, -30],
  [0.24, -8, -24],
  [0.38, -34, -14],
  [0.50, -30, -70],
  [0.62, -8, -125],
  [0.76, 30, -120],
  [0.90, 46, -60],
  [1.00, 30, -10],
];
const SUPPORT_END = 0.38;

const smooth = (t) => t * t * (3 - 2 * t);
function legPose(p) {
  p = ((p % 1) + 1) % 1;
  let i = 0;
  while (i < LEG_KEYS.length - 2 && p >= LEG_KEYS[i + 1][0]) i++;
  const [a0, t0, k0] = LEG_KEYS[i], [a1, t1, k1] = LEG_KEYS[i + 1];
  const u = smooth((p - a0) / (a1 - a0));
  return { thigh: t0 + (t1 - t0) * u, knee: k0 + (k1 - k0) * u };
}

// Высота бедра над землёй, если нога стоит на земле в этой позе.
const reach = ({ thigh, knee }) => Math.cos(thigh * D) * THIGH + Math.cos((thigh + knee) * D) * SHIN;

// Высота таза в цикле: на опоре — по опорной ноге, в полёте — плавная дуга вверх.
function hipHeight(p) {
  const pa = ((p % 1) + 1) % 1, pb = (pa + 0.5) % 1;
  const sup = pa < SUPPORT_END ? pa : pb < SUPPORT_END ? pb : null;
  if (sup !== null) return reach(legPose(sup)) + 1.5; // + подошва
  // полёт: от толчка одной ноги до касания другой
  const fp = pa >= SUPPORT_END && pa < 0.5 ? pa : pb;
  const u = (fp - SUPPORT_END) / (0.5 - SUPPORT_END);
  const h0 = reach(legPose(SUPPORT_END)) + 1.5, h1 = reach(legPose(0)) + 1.5;
  return h0 + (h1 - h0) * u + 4 * u * (1 - u) * 3.5;
}

// Позы в прыжке.
const JUMP_UP = { near: { thigh: 62, knee: -95 }, far: { thigh: -18, knee: -55 }, armN: 105, armF: -45 };
const JUMP_FALL = { near: { thigh: 38, knee: -35 }, far: { thigh: -6, knee: -45 }, armN: 70, armF: -55 };
const TUCK = { near: { thigh: 80, knee: -135 }, far: { thigh: 62, knee: -125 }, armN: 40, armF: 20 };
const mixPose = (a, b, u) => ({ thigh: a.thigh + (b.thigh - a.thigh) * u, knee: a.knee + (b.knee - a.knee) * u });

function shade(hex, k = 0.22) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const d = (c) => Math.round(c * (1 - k)).toString(16).padStart(2, '0');
  return '#' + d(r) + d(g) + d(b);
}

// cx — центр бегуна по горизонтали (экран), footY — земля под ногами с учётом прыжка (экран), s — масштаб.
// Стиль — по референсу владельца: плоская векторная бегунья, спортивный топ, легинсы,
// белые носки, яркие кроссовки, длинный хвост. Конечности — сужающиеся формы, кулаки.
export function drawRunnerFigure(ctx, C, cx, footY, s, st, runner) {
  const girl = runner === 'girl';
  const airborne = st.y > 0.5;
  const phase = st.x / 92;                 // один цикл (два шага) ≈ 92 ед. пути
  const top = girl ? C.coral : C.accent;               // топ / футболка
  const topDark = shade(top, 0.18);
  const legs = girl ? C.leggings : C.logo;             // легинсы / шорты
  const shoe = girl ? C.coral : C.accent;
  const P = (x, y) => [cx + x * s, footY - y * s];
  const dir = (deg) => [Math.sin(deg * D), Math.cos(deg * D)];
  const add = (p, deg, len) => { const d = dir(deg); return [p[0] + d[0] * len, p[1] - d[1] * len]; };
  const lerpP = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  let near, far, armNear, armFar, hipH, lean = 11;
  if (!airborne) {
    near = legPose(phase);
    far = legPose(phase + 0.5);
    armNear = -legPose(phase).thigh * 1.1;
    armFar = -legPose(phase + 0.5).thigh * 1.1;
    hipH = hipHeight(phase);
  } else {
    let pose;
    if (st.jumps >= 2 && st.vy > -150) pose = TUCK;
    else {
      const u = Math.min(1, Math.max(0, (420 - st.vy) / 700));
      pose = { near: mixPose(JUMP_UP.near, JUMP_FALL.near, u), far: mixPose(JUMP_UP.far, JUMP_FALL.far, u),
        armN: JUMP_UP.armN + (JUMP_FALL.armN - JUMP_UP.armN) * u, armF: JUMP_UP.armF + (JUMP_FALL.armF - JUMP_UP.armF) * u };
    }
    near = pose.near; far = pose.far; armNear = pose.armN; armFar = pose.armF;
    hipH = Math.max(reach(near), reach(far)) + 1.5;
    lean = 5;
  }

  const hip = [0, hipH];
  const shoulder = add(hip, 180 - lean, TORSO);
  const waist = lerpP(hip, shoulder, 0.42);
  const neckTop = add(shoulder, 180 - lean * 0.5, NECK);
  const headC = [neckTop[0] + 1.6, neckTop[1] + HEAD - 1.2];

  // сужающаяся «капсула» между точками a и b (радиусы r1 → r2)
  const capsule = (a, b, r1, r2, color) => {
    const A = P(...a), B = P(...b);
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L, R1 = r1 * s, R2 = r2 * s;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(A[0] + nx * R1, A[1] + ny * R1); ctx.lineTo(B[0] + nx * R2, B[1] + ny * R2);
    ctx.lineTo(B[0] - nx * R2, B[1] - ny * R2); ctx.lineTo(A[0] - nx * R1, A[1] - ny * R1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(A[0], A[1], R1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(B[0], B[1], R2, 0, Math.PI * 2); ctx.fill();
  };
  const poly = (pts, color) => {
    ctx.fillStyle = color; ctx.beginPath();
    pts.forEach((p, i) => { const q = P(...p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    ctx.closePath(); ctx.fill();
  };

  const drawLeg = (pose, isFar) => {
    const skin = isFar ? C.skinShade : C.skin;
    const lg = isFar ? shade(legs, 0.25) : legs;
    const knee = add(hip, pose.thigh, THIGH);
    const shinDeg = pose.thigh + pose.knee;
    const ankle = add(knee, shinDeg, SHIN);
    if (girl) {
      // легинсы до щиколотки, белый носок
      capsule(hip, knee, 6.4, 4.6, lg);
      capsule(knee, add(knee, shinDeg, SHIN - 3), 4.5, 2.9, lg);
      capsule(add(knee, shinDeg, SHIN - 3.2), ankle, 2.7, 2.5, isFar ? shade(C.sock, 0.12) : C.sock);
    } else {
      capsule(hip, knee, 6.0, 4.4, skin);
      capsule(knee, ankle, 4.2, 2.5, skin);
      capsule(hip, add(hip, pose.thigh, THIGH * 0.5), 6.8, 5.8, lg);   // шорты
      capsule(add(knee, shinDeg, SHIN - 2.6), ankle, 2.7, 2.5, isFar ? shade(C.sock, 0.12) : C.sock);
    }
    // кроссовок: носок вперёд, перпендикулярно голени
    const f = shinDeg + 90, u = shinDeg + 180;
    const heel = add(ankle, f, -3);
    const pts = [add(heel, u, 3.2), add(ankle, f, 6.6), add(add(ankle, f, 9.2), u, -1.6), add(add(heel, u, -2.6), f, 0.5)];
    poly(pts, isFar ? shade(shoe, 0.22) : shoe);
    // белая подошва
    const s0 = add(add(heel, u, -2.6), f, 0.5), s1 = add(add(ankle, f, 9.2), u, -1.6);
    capsule(s0, s1, 1.0, 0.9, isFar ? shade(C.white, 0.12) : C.white);
  };

  const drawArm = (deg, isFar) => {
    const skin = isFar ? C.skinShade : C.skin;
    const elbow = add(shoulder, deg, UPPER);
    const bend = 84 + Math.max(0, Math.min(1, (deg + 40) / 80)) * 22;
    const hand = add(elbow, deg + bend, FORE);
    capsule(shoulder, elbow, 3.5, 2.8, skin);
    capsule(elbow, hand, 2.8, 2.3, skin);
    if (!girl) capsule(shoulder, add(shoulder, deg, UPPER * 0.42), 4.2, 3.9, isFar ? shade(top, 0.25) : top); // рукав
    const H = P(...hand); ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(H[0], H[1], 3.3 * s, 0, Math.PI * 2); ctx.fill();   // кулак
  };

  // --- хвост (позади головы) ---
  const hc = P(...headC);
  const sway = airborne ? (st.vy > 0 ? 0.35 : -0.25) : Math.sin(phase * Math.PI * 4) * 0.18;
  if (girl) {
    const tie = [hc[0] - 6.5 * s, hc[1] - 4.5 * s];
    const len = 25 * s;
    const ang = Math.PI + 0.12 + sway;             // назад и чуть вниз
    const tip = [tie[0] + Math.cos(ang) * len, tie[1] - Math.sin(ang) * len * -1 + 5 * s];
    ctx.fillStyle = C.hair;
    ctx.beginPath();
    ctx.moveTo(tie[0], tie[1] - 2.6 * s);
    ctx.bezierCurveTo(tie[0] - 9 * s, tie[1] - 9 * s, tip[0] + 6 * s, tip[1] - 9 * s, tip[0], tip[1]);
    ctx.bezierCurveTo(tip[0] + 9 * s, tip[1] + 1 * s, tie[0] - 6 * s, tie[1] + 7 * s, tie[0], tie[1] + 3 * s);
    ctx.closePath(); ctx.fill();
  }

  drawArm(armFar, true);
  drawLeg(far, true);

  // --- корпус ---
  if (girl) {
    capsule(hip, waist, 6.6, 5.0, C.skin);             // талия (открытый живот)
    capsule(lerpP(hip, shoulder, 0.5), shoulder, 5.6, 6.2, top);  // спортивный топ
    capsule(lerpP(hip, shoulder, 0.5), lerpP(hip, shoulder, 0.56), 5.7, 5.7, topDark); // резинка топа
    capsule(hip, lerpP(hip, shoulder, 0.2), 7.0, 6.2, legs);     // пояс легинсов
  } else {
    capsule(hip, shoulder, 6.6, 6.8, top);
    capsule(hip, lerpP(hip, shoulder, 0.16), 7.0, 6.7, legs);
  }
  drawLeg(near, false);

  // --- шея и голова ---
  capsule(shoulder, neckTop, 2.6, 2.4, C.skin);
  ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(hc[0], hc[1], HEAD * s, 0, Math.PI * 2); ctx.fill();
  // нос — лёгкий выступ вперёд
  ctx.beginPath(); ctx.arc(hc[0] + 7.4 * s, hc[1] + 0.8 * s, 1.6 * s, 0, Math.PI * 2); ctx.fill();
  // волосы
  ctx.fillStyle = C.hair;
  ctx.beginPath();
  ctx.arc(hc[0] - 0.6 * s, hc[1] - 0.6 * s, (HEAD + 0.7) * s, Math.PI * 0.82, Math.PI * 1.9);
  ctx.quadraticCurveTo(hc[0] + 2 * s, hc[1] - 3.5 * s, hc[0] - 1.5 * s, hc[1] - 1 * s);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(hc[0] - 3.2 * s, hc[1] + 0.5 * s, (HEAD - 1.8) * s, Math.PI * 0.45, Math.PI * 1.25); ctx.fill();
  if (girl) { // резинка
    ctx.fillStyle = C.coral; ctx.beginPath(); ctx.arc(hc[0] - 6.6 * s, hc[1] - 4.5 * s, 1.9 * s, 0, Math.PI * 2); ctx.fill();
  }
  // ухо, глаз, улыбка
  ctx.fillStyle = C.skinShade; ctx.beginPath(); ctx.arc(hc[0] - 1 * s, hc[1] + 1 * s, 1.7 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.hair; ctx.beginPath(); ctx.arc(hc[0] + 4.3 * s, hc[1] - 0.8 * s, 0.95 * s, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.coral; ctx.lineWidth = 0.9 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(hc[0] + 4.6 * s, hc[1] + 2.6 * s, 1.8 * s, Math.PI * 0.15, Math.PI * 0.75); ctx.stroke();

  drawArm(armNear, false);
}
