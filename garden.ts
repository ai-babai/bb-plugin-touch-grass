export const BLOOM_MS = 800;
const RIPEN_MS = 1200;
/**
 * ripe — у земляники завязалась ягода: время начала покраснения, 0 — уже спелая.
 * В саду хранится однократно как `ripe: true`; старые записи без поля — цветок без ягоды.
 */
export type Flower = { at: number; kind: number; born: number; bend: number; vel: number; hx?: number; hy?: number; ripe?: number };

export const FLOWER_KINDS = [
  { petal: "#f7f4ec", center: "#e7b52c", n: 9, long: 1.55, wide: 0.5 }, // ромашка
  { petal: "#5d82d8", center: "#2c3d78", n: 7, long: 1.35, wide: 0.55 }, // василёк
  { petal: "#d97ba7", center: "#b0557e", n: 10, long: 0.95, wide: 0.6 }, // клевер
  { petal: "#f3c531", center: "#c58b12", n: 5, long: 1.0, wide: 0.85 }, // лютик
  { petal: "#f7f4ec", center: "#d9c64a", n: 5, long: 1.0, wide: 0.95 }, // земляника
];
const STRAWBERRY = 4;
const BERRY = { red: "#d8333b", sepal: "#4c8a36", seed: "#f2d27a" };

export function gardenCapacity(growth: number) {
  return 3 + Math.round(growth * 9);
}

function gardenKey(threadId: string) {
  return `bb-touch-grass:garden:${threadId}`;
}

export function loadGarden(threadId: string, width: number): Flower[] {
  try {
    const raw = window.localStorage.getItem(gardenKey(threadId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.slice(0, gardenCapacity(1)).flatMap(f => {
      if (!f || !Number.isInteger(f.kind)) return [];
      // Earlier local installs saved the distance from the left edge in pixels.
      const at = f.at ?? f.x / Math.max(1, width);
      if (!Number.isFinite(at)) return [];
      const kind = Math.abs(f.kind) % FLOWER_KINDS.length;
      const flower: Flower = { at: Math.max(0.02, Math.min(0.98, at)), kind, born: 0, bend: 0, vel: 0 };
      if (kind === STRAWBERRY && f.ripe === true) flower.ripe = 0;
      return [flower];
    });
  } catch {
    return [];
  }
}

export function saveGarden(threadId: string, flowers: Flower[]) {
  try {
    window.localStorage.setItem(gardenKey(threadId), JSON.stringify(flowers.map(f => (f.ripe === undefined ? { at: f.at, kind: f.kind } : { at: f.at, kind: f.kind, ripe: true }))));
  } catch {
    // Хранилище недоступно — цветы проживут до закрытия чата.
  }
}

/** Пчела села на цветок: земляника один раз завязывает ягоду. true — сад изменился. */
export function ripenBerry(flower: Flower | undefined, now: number) {
  if (flower?.kind !== STRAWBERRY || flower.ripe !== undefined) return false;
  flower.ripe = now;
  return true;
}

const SEEDS = [[-0.35, -0.05], [0.35, -0.05], [0, 0.15], [-0.18, 0.35], [0.18, 0.35]];

/** Ягода свисает сбоку от цветка: зелёная завязь краснеет, проступают семена. */
function drawBerry(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ripe: number, now: number) {
  const p = ripe ? Math.min(1, (now - ripe) / RIPEN_MS) : 1;
  const w = r * 0.8;
  const top = -r * 0.6;
  ctx.save();
  ctx.translate(x + r * 0.95, y + r * 1.4);
  ctx.beginPath();
  ctx.moveTo(-r * 0.95, -r * 1.4);
  ctx.quadraticCurveTo(0, -r * 1.4, 0, top);
  ctx.strokeStyle = BERRY.sepal;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, top);
  ctx.bezierCurveTo(w, top * 1.1, w * 0.75, r * 0.35, 0, r * 0.7);
  ctx.bezierCurveTo(-w * 0.75, r * 0.35, -w, top * 1.1, 0, top);
  ctx.fillStyle = p < 1 ? `hsl(${85 * (1 - p)}, ${45 + 22 * p}%, ${68 - 15 * p}%)` : BERRY.red;
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


export function drawFlowers(ctx: CanvasRenderingContext2D, flowers: Flower[], width: number, full: number, ground: number, shown: number, dark: boolean) {
  if (!flowers.length) return;
  const now = performance.now();
  for (const f of flowers) {
    const x = f.at * width;
    const bloom = f.born ? Math.min(1, (now - f.born) / BLOOM_MS) : 1;
    const open = 1 - Math.pow(1 - bloom, 3);
    const stem = Math.max(10, full * 0.6) * (0.45 + 0.55 * open);
    const bend = Math.max(-1, Math.min(1, f.bend));
    const headX = x + bend * stem * 0.5;
    const headY = ground - stem * (1 - 0.15 * bend * bend);
    ctx.beginPath();
    ctx.moveTo(x, ground + 0.5);
    ctx.quadraticCurveTo(x + bend * stem * 0.1, ground - stem * 0.5, headX, headY);
    ctx.strokeStyle = dark ? "hsla(105, 32%, 38%, 0.9)" : "hsla(105, 38%, 34%, 0.95)";
    ctx.lineWidth = 1.1;
    ctx.stroke();
    f.hx = headX;
    f.hy = headY;
    const kind = FLOWER_KINDS[f.kind];
    const r = (2.7 + 1.9 * shown) * open;
    if (r < 0.3) continue;
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(bend * 0.6 + x * 0.37);
    ctx.globalAlpha = dark ? 0.9 : 1;
    ctx.fillStyle = kind.petal;
    for (let i = 0; i < kind.n; i++) {
      ctx.rotate((Math.PI * 2) / kind.n);
      ctx.beginPath();
      ctx.ellipse(0, -r * kind.long * 0.55, r * kind.wide * 0.55, r * kind.long * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = kind.center;
    ctx.fill();
    ctx.restore();
    if (f.ripe !== undefined) drawBerry(ctx, headX, headY, r, f.ripe, now);
  }
}
