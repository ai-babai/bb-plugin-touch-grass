/**
 * Земляника — отдельный низкий кустик, а не цветок: несколько зелёных трилистников на
 * черешках от общего корня и ягоды на собственных плодоножках. Пока пчела не побывала,
 * ягоды зелёные; после опыления краснеют. Модуль не зависит от garden.ts (без циклов).
 */

/** Номер вида в саду: хранится как kind=4, спелость — `ripe: true`. */
export const STRAWBERRY = 4;
export const LEAF = "#2f7a2c"; // цвет листьев; им же разлетаются обрезки под косой
const LEAF_DARK = "#286424";
const VEIN = "#8cc46a";
const STALK = "#5f8f3f";
const BERRY = { green: "#b4d288", red: "#d8333b", sepal: "#4c8a36", seed: "#f2d27a" };
const RIPEN_MS = 1200;

/** Положение кустика в px холста — та же мера, что у цветка (FlowerShape). */
export type BushShape = { x: number; headX: number; headY: number; r: number; stem: number; bend: number; open: number };

/** Кустик ниже цветов: невысокий, а «головка» — верхний трилистник, на него садится пчела. */
export function bushShape(x: number, ground: number, full: number, shown: number, open: number, bend: number): BushShape {
  const stem = Math.max(7, Math.min(32, full * 0.3)) * (0.45 + 0.55 * open);
  return {
    x, stem, bend, open,
    headX: x + bend * stem * 0.35,
    headY: ground - stem * (1 - 0.1 * bend * bend),
    r: (4 + 3 * shown) * open,
  };
}

/** Трилистник: три овальных листочка с жилкой, расходятся от конца черешка. */
function trefoil(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, tilt: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  for (const a of [-1.05, 0, 1.05]) {
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.55, size * 0.36, size * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.12);
    ctx.lineTo(0, -size * 0.95);
    ctx.strokeStyle = VEIN;
    ctx.lineWidth = 0.4;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

const SEEDS = [[-0.35, -0.05], [0.35, -0.05], [0, 0.15], [-0.18, 0.35], [0.18, 0.35]];

/** Ягода висит на конце плодоножки: зелёная завязь краснеет, проступают семена. */
function drawBerry(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, p: number) {
  const w = r * 0.8;
  const top = -r * 0.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.bezierCurveTo(w, top * 1.1, w * 0.75, r * 0.35, 0, r * 0.7);
  ctx.bezierCurveTo(-w * 0.75, r * 0.35, -w, top * 1.1, 0, top);
  ctx.fillStyle = p <= 0 ? BERRY.green : p < 1 ? `hsl(${85 * (1 - p)}, ${45 + 22 * p}%, ${68 - 15 * p}%)` : BERRY.red;
  ctx.fill();
  if (p > 0.6) {
    ctx.fillStyle = BERRY.seed;
    for (const [sx, sy] of SEEDS) ctx.fillRect(sx * w - 0.35, sy * r * 1.3 - 0.35, 0.7, 0.7);
  }
  ctx.fillStyle = BERRY.sepal;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(0, top, w * 0.55, w * 0.18, (Math.PI / 5) * i - Math.PI / 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function curve(ctx: CanvasRenderingContext2D, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, color: string, width: number) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * Рисует кустик. ripe: undefined — ягоды зелёные (не опылён); 0 — спелые сразу;
 * иначе время начала покраснения. at задаёт постоянную зеркальность куста.
 */
export function drawStrawberryBush(ctx: CanvasRenderingContext2D, s: BushShape, ground: number, at: number, ripe: number | undefined, now: number, dark: boolean) {
  const { x, stem: h, bend, headX, headY, r } = s;
  if (r < 0.3) return;
  const side = Math.round(at * 997) % 2 ? 1 : -1;
  const sway = bend * h * 0.3;
  const leaf = r * 1.1;
  ctx.save();
  ctx.globalAlpha = dark ? 0.9 : 1;
  // Два боковых трилистника пониже, верхний — посередине.
  const leaves = [
    { tx: x - side * h * 0.55 + sway, ty: ground - h * 0.62, tilt: -side * 0.7 + bend * 0.4, size: leaf * 0.9, fill: LEAF_DARK },
    { tx: x + side * h * 0.5 + sway, ty: ground - h * 0.75, tilt: side * 0.6 + bend * 0.4, size: leaf * 0.95, fill: LEAF_DARK },
    { tx: headX, ty: headY, tilt: bend * 0.5, size: leaf, fill: LEAF },
  ];
  for (const l of leaves) {
    curve(ctx, x, ground + 0.5, (x + l.tx) / 2, l.ty + h * 0.15, l.tx, l.ty, STALK, 0.9);
    trefoil(ctx, l.tx, l.ty, l.size, l.tilt, l.fill);
  }
  // Ягоды на своих плодоножках: выходят от корня, выгибаются в сторону и свисают под тяжестью.
  const p = ripe === undefined ? 0 : ripe ? Math.min(1, (now - ripe) / RIPEN_MS) : 1;
  const berries = [
    { dx: side * Math.min(h * 0.6, 12), drop: Math.max(h * 0.3, r * 0.6), size: r * 0.62 },
    { dx: -side * Math.min(h * 0.32, 7), drop: Math.max(h * 0.2, r * 0.5), size: r * 0.5 },
  ];
  for (const b of berries) {
    const bx = x + b.dx + sway * 0.6;
    const by = ground - b.drop;
    curve(ctx, x, ground, x + b.dx * 0.4, ground - h * 0.65, bx, by - b.size * 0.6, STALK, 0.7);
    drawBerry(ctx, bx, by, b.size, p);
  }
  ctx.restore();
}
