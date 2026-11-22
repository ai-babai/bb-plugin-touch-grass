/**
 * Рисунок цветов 0–3 (ромашка, василёк, клевер, лютик): длина стебля, листья по видам и
 * жилки белой ромашки. Только геометрия и цвет; где цветок стоит и как гнётся —
 * решает garden.ts (flowerShape), общий для рисунка, касания и покоса.
 */

/**
 * Насколько зрелый цветок поднимается над массой травы вокруг: головки чуть выступают,
 * клевер остаётся пониже, в траве. Плюс несколько px, чтобы головка была видна и в низком луге.
 */
const KIND_RISE = [1.1, 1.14, 0.86, 1.18];
const LIFT_PX = [3, 3, 0, 4];
/** Устойчивый шум 0..1 по позиции и виду: один и тот же цветок всегда одной высоты. */
function noise(at: number, kind: number) {
  const s = Math.sin(at * 12.9898 * 1000 + kind * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Длина стебля зрелого цветка, px, от высоты массы травы у его места (mass, px; flower-canopy).
 * Вид и место дают плавную вариацию ±6%, поэтому соседние цветы не стоят ровным рядом.
 */
export function stemLength(kind: number, at: number, mass: number) {
  return Math.max(10, mass * (KIND_RISE[kind] ?? 1) * (0.94 + 0.12 * noise(at, kind)) + (LIFT_PX[kind] ?? 2));
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

/**
 * Часть листа в системе листа (ось листа — вверх, -y), в долях size:
 * blade — заострённая пластинка от точки (x, y) длиной a, полушириной b;
 * oval — эллипс с центром (x, y), полуосями a × b. rot — поворот части.
 * Листья описаны данными: по одному плану их рисует холст и считают попадания коса и слой касаний.
 */
type Piece = { blade: boolean; x: number; y: number; rot: number; a: number; b: number };
/** Лист: точка на стебле t, сторона и отклонение от стебля, части. */
type LeafPlan = { t: number; side: number; spread: number; pieces: Piece[] };

const bladePiece = (len: number, w: number, rot = 0): Piece => ({ blade: true, x: 0, y: 0, rot, a: len, b: w });
const oval = (x: number, y: number, rx: number, ry: number, rot = 0): Piece => ({ blade: false, x, y, rot, a: rx, b: ry });

/** Ромашка: перистый лист — средняя жилка с парами мелких долек. */
function daisyLeaf(t: number, side: number): LeafPlan {
  const len = t < 0.3 ? 1.15 : 0.95;
  const pieces = [bladePiece(len, 0.13)];
  for (let i = 1; i <= 3; i++) {
    for (const dir of [-1, 1]) pieces.push(oval(dir * 0.16, -len * (0.22 + i * 0.2), 0.17, 0.08, dir * -0.6));
  }
  return { t, side, spread: 0.95, pieces };
}

/** Клевер: тройчатый лист на черешке — три округлых листочка вокруг конца черешка. */
function cloverLeaf(t: number, side: number): LeafPlan {
  const reach = 0.55;
  const pieces = [bladePiece(reach, 0.09)]; // черешок
  for (const a of [-1.15, 0, 1.15]) pieces.push(oval(Math.sin(a) * 0.28, -reach - Math.cos(a) * 0.28, 0.24, 0.3, a));
  return { t, side, spread: 1.0, pieces };
}

const fan = (angles: number[], len: (a: number) => number, w: number) => angles.map(a => bladePiece(len(a), w, a));

const LEAF_PLANS: LeafPlan[][] = [
  [daisyLeaf(0.28, -1), daisyLeaf(0.57, 1)],
  // Василёк: узкие сизые линейные листья, прижатые к стеблю.
  [0.2, 0.43, 0.65].map((t, i) => ({ t, side: i % 2 ? -1 : 1, spread: 0.6, pieces: [bladePiece(1.5 - t, 0.22)] })),
  [cloverLeaf(0.12, -1), cloverLeaf(0.3, 1)],
  // Лютик: прикорневой пальчато-рассечённый лист веером и маленький листок на стебле.
  [
    { t: 0.08, side: -1, spread: 0.9, pieces: fan([-0.75, -0.25, 0.25, 0.75], a => 1 - Math.abs(a) * 0.3, 0.22) },
    { t: 0.5, side: 1, spread: 0.8, pieces: fan([-0.4, 0, 0.4], () => 0.6, 0.1) },
  ],
];

/** Размер листа: следует за стеблем, но остаётся различимым и в низком луге. 0 — листьев ещё нет. */
function leafSize(s: Stem, open: number) {
  const size = Math.max(5, Math.min(11, s.len * 0.3)) * open;
  return size < 1.5 ? 0 : size;
}

/** Начало листа на стебле и его поворот: лист чуть никнет по ветру вместе со стеблем. */
function leafBase(s: Stem, plan: LeafPlan) {
  const p = pointAt(s, plan.t);
  return { x: p.x, y: p.y, angle: p.angle + plan.side * plan.spread + s.bend * 0.25 };
}

function paintPiece(ctx: CanvasRenderingContext2D, piece: Piece, size: number) {
  ctx.save();
  ctx.translate(piece.x * size, piece.y * size);
  ctx.rotate(piece.rot);
  ctx.beginPath();
  if (piece.blade) {
    const len = piece.a * size, w = piece.b * size;
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(w, -len * 0.45, 0, -len);
    ctx.quadraticCurveTo(-w, -len * 0.45, 0, 0);
  } else {
    ctx.ellipse(0, 0, piece.a * size, piece.b * size, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

function paintLeaves(ctx: CanvasRenderingContext2D, kind: number, s: Stem, size: number) {
  for (const plan of LEAF_PLANS[kind] ?? []) {
    const base = leafBase(s, plan);
    ctx.save();
    ctx.translate(base.x, base.y);
    ctx.rotate(base.angle);
    for (const piece of plan.pieces) paintPiece(ctx, piece, size);
    ctx.restore();
  }
}

/** Эллипс в px холста: центр, полуоси и поворот (рад). Мера попаданий для листвы. */
export type Oval = { x: number; y: number; rx: number; ry: number; rot: number };

/** Часть листа как эллипс в системе листа; пластинка — по длине и наибольшей ширине (b/2 у квадратичного края). */
function pieceOval(p: Piece, size: number) {
  if (!p.blade) return { x: p.x * size, y: p.y * size, rx: p.a * size, ry: p.b * size };
  const half = p.a * size * 0.5;
  return { x: Math.sin(p.rot) * half, y: -Math.cos(p.rot) * half, rx: p.b * size * 0.5, ry: half };
}

/** Листья вида как эллипсы в px холста — по тем же планам и поворотам, что и рисунок. */
export function leafOvals(kind: number, s: Stem, open: number): Oval[] {
  const size = leafSize(s, open);
  const out: Oval[] = [];
  if (!size) return out;
  for (const plan of LEAF_PLANS[kind] ?? []) {
    const base = leafBase(s, plan);
    const cos = Math.cos(base.angle), sin = Math.sin(base.angle);
    for (const p of plan.pieces) {
      const o = pieceOval(p, size);
      out.push({ x: base.x + o.x * cos - o.y * sin, y: base.y + o.x * sin + o.y * cos, rx: o.rx, ry: o.ry, rot: base.angle + p.rot });
    }
  }
  return out;
}

/** Стебель по положению цветка: та же кривая, что рисуется на холсте. */
export function stemOf(s: { x: number; stem: number; bend: number; headX: number; headY: number }, ground: number): Stem {
  return { x: s.x, ground, cx: s.x + s.bend * s.stem * 0.1, cy: ground - s.stem * 0.5, headX: s.headX, headY: s.headY, len: s.stem, bend: s.bend };
}

/** Листья вида на стебле; размер следует за стеблем, но остаётся различимым и в низком луге. */
/** Свежая весенняя зелень ростка: светлее травы, чтобы молодое растение узнавалось в луге. */
export const SPROUT_LIGHT = "#86c447";
export const SPROUT_DARK = "#9fd85e";

export function drawLeaves(ctx: CanvasRenderingContext2D, kind: number, s: Stem, open: number, dark: boolean, young = false) {
  const size = leafSize(s, open);
  if (!size) return;
  ctx.fillStyle = young ? (dark ? SPROUT_DARK : SPROUT_LIGHT) : (dark ? LEAF_DARK : LEAF_LIGHT)[kind];
  paintLeaves(ctx, kind, s, size);
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
