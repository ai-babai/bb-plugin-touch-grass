/**
 * Рисунок цветов 0–3 (ромашка, василёк, клевер, лютик): длина стебля, листья по видам и
 * жилки белой ромашки. Только геометрия и цвет; где цветок стоит и как гнётся —
 * решает garden.ts (flowerShape), общий для рисунка, касания и покоса.
 */

/** Стебель короче травинки: клевер низкий, лютик чуть выше ромашки. */
const KIND_STEM = [1.0, 0.95, 0.72, 1.06];
const SOFT_FROM = 36; // до этой длины стебель растёт вместе с лугом, px
const SOFT_CAP = 56; // в высоких «Зарослях» стебель плавно упирается сюда, px

/** Устойчивый шум 0..1 по позиции и виду: один и тот же цветок всегда одной высоты. */
function noise(at: number, kind: number) {
  const s = Math.sin(at * 12.9898 * 1000 + kind * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Длина стебля цветка, px. В обычном луге — 0.6 высоты травы, как раньше; выше SOFT_FROM
 * рост мягко насыщается к SOFT_CAP, поэтому в «Зарослях» цветы остаются у земли.
 */
export function stemLength(kind: number, at: number, full: number) {
  const base = full * 0.6;
  const soft = base <= SOFT_FROM ? base : SOFT_FROM + (SOFT_CAP - SOFT_FROM) * Math.tanh((base - SOFT_FROM) / (SOFT_CAP - SOFT_FROM));
  return Math.max(10, soft * (KIND_STEM[kind] ?? 1) * (0.9 + 0.2 * noise(at, kind)));
}

/** Стебель — квадратичная кривая от земли к головке. */
export type Stem = { x: number; ground: number; cx: number; cy: number; headX: number; headY: number; len: number; bend: number };

function pointAt(s: Stem, t: number) {
  const u = 1 - t;
  return {
    x: u * u * s.x + 2 * u * t * s.cx + t * t * s.headX,
    y: u * u * s.ground + 2 * u * t * s.cy + t * t * s.headY,
    // направление стебля в точке: угол от вертикали вверх
    angle: Math.atan2(2 * u * (s.cx - s.x) + 2 * t * (s.headX - s.cx), -(2 * u * (s.cy - s.ground) + 2 * t * (s.headY - s.cy))),
  };
}

const LEAF_LIGHT = ["#4d8a3b", "#6f9a7a", "#3f7f35", "#4a8838"]; // по видам; василёк сизый
const LEAF_DARK = ["#5c9a48", "#7fa88a", "#4f9142", "#589844"];

/** Заострённый лист вдоль оси вверх от (0,0): длина len, полуширина w. */
function blade(ctx: CanvasRenderingContext2D, len: number, w: number) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(w, -len * 0.45, 0, -len);
  ctx.quadraticCurveTo(-w, -len * 0.45, 0, 0);
  ctx.fill();
}

/** Начать рисовать лист: точка на стебле t, отклонение side·spread от стебля. */
function leafAt(ctx: CanvasRenderingContext2D, s: Stem, t: number, side: number, spread: number) {
  const p = pointAt(s, t);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle + side * spread + s.bend * 0.25); // лист чуть никнет по ветру вместе со стеблем
}

/** Ромашка: два перистых листа — средняя жилка с парами мелких долек. */
function daisyLeaves(ctx: CanvasRenderingContext2D, s: Stem, size: number) {
  for (const [t, side] of [[0.28, -1], [0.57, 1]]) {
    leafAt(ctx, s, t, side, 0.95);
    const len = size * (t < 0.3 ? 1.15 : 0.95);
    blade(ctx, len, size * 0.13);
    for (let i = 1; i <= 3; i++) {
      const y = -len * (0.22 + i * 0.2);
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(dir * size * 0.16, y, size * 0.17, size * 0.08, dir * -0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/** Василёк: узкие сизые линейные листья, прижатые к стеблю. */
function cornflowerLeaves(ctx: CanvasRenderingContext2D, s: Stem, size: number) {
  for (const [t, side] of [[0.20, 1], [0.43, -1], [0.65, 1]]) {
    leafAt(ctx, s, t, side, 0.60);
    blade(ctx, size * (1.5 - t), size * 0.22);
    ctx.restore();
  }
}

/** Клевер: тройчатый лист на черешке у земли — три округлых листочка. */
function cloverLeaves(ctx: CanvasRenderingContext2D, s: Stem, size: number) {
  for (const [t, side] of [[0.12, -1], [0.3, 1]]) {
    leafAt(ctx, s, t, side, 1.0);
    const reach = size * 0.55;
    ctx.fillRect(-0.4, -reach, 0.8, reach); // черешок
    ctx.translate(0, -reach);
    for (const a of [-1.15, 0, 1.15]) {
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.28, size * 0.24, size * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

/** Лютик: прикорневой пальчато-рассечённый лист веером и маленький листок на стебле. */
function buttercupLeaves(ctx: CanvasRenderingContext2D, s: Stem, size: number) {
  leafAt(ctx, s, 0.08, -1, 0.9);
  for (const a of [-0.75, -0.25, 0.25, 0.75]) {
    ctx.save();
    ctx.rotate(a);
    blade(ctx, size * (1 - Math.abs(a) * 0.3), size * 0.22);
    ctx.restore();
  }
  ctx.restore();
  leafAt(ctx, s, 0.5, 1, 0.8);
  for (const a of [-0.4, 0, 0.4]) {
    ctx.save();
    ctx.rotate(a);
    blade(ctx, size * 0.6, size * 0.1);
    ctx.restore();
  }
  ctx.restore();
}

const LEAVES = [daisyLeaves, cornflowerLeaves, cloverLeaves, buttercupLeaves];

/** Листья вида на стебле; размер следует за стеблем, но остаётся различимым и в низком луге. */
export function drawLeaves(ctx: CanvasRenderingContext2D, kind: number, s: Stem, open: number, dark: boolean) {
  const size = Math.max(4, Math.min(11, s.len * 0.3)) * open;
  if (size < 1.5) return;
  ctx.fillStyle = (dark ? LEAF_DARK : LEAF_LIGHT)[kind];
  LEAVES[kind]?.(ctx, s, size);
}

/**
 * Белая ромашка на светлой теме: тонкая тёплая жилка внутри каждого лепестка (от сердцевины, не до
 * кончика) отделяет лепестки друг от друга и от фона без контура и ореола вокруг головки.
 * Вызывается в системе координат головки, уже повёрнутой как венчик.
 */
export function daisyVeins(ctx: CanvasRenderingContext2D, r: number, n: number, long: number) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    ctx.rotate((Math.PI * 2) / n);
    ctx.moveTo(0, -r * 0.5);
    ctx.lineTo(0, -r * long * 0.85);
  }
  ctx.strokeStyle = "rgba(168, 150, 104, 0.45)";
  ctx.lineWidth = Math.min(0.6, r * 0.12);
  ctx.stroke();
}
