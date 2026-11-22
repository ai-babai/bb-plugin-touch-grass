import { daisyVeins, drawLeaves, type Stem, stemLength } from "./flower-art";
import { bushShape, drawStrawberryBush, LEAF, STRAWBERRY } from "./strawberry";

export const BLOOM_MS = 800;
/**
 * kind=4 — не цветок, а низкий кустик земляники (strawberry.ts).
 * ripe — у земляники ягоды опылены: время начала покраснения, 0 — уже спелые.
 * В саду хранится однократно как `ripe: true`; без поля — кустик с зелёными ягодами.
 */
export type Flower = { at: number; kind: number; born: number; bend: number; vel: number; hx?: number; hy?: number; ripe?: number };

export const FLOWER_KINDS = [
  { petal: "#f7f4ec", center: "#e7b52c", n: 9, long: 1.55, wide: 0.5 }, // ромашка
  { petal: "#5d82d8", center: "#2c3d78", n: 7, long: 1.35, wide: 0.55 }, // василёк
  { petal: "#d97ba7", center: "#b0557e", n: 10, long: 0.95, wide: 0.6 }, // клевер
  { petal: "#f3c531", center: "#c58b12", n: 5, long: 1.0, wide: 0.85 }, // лютик
  { petal: LEAF, center: LEAF, n: 3, long: 1.0, wide: 0.7 }, // земляника: кустик, рисует strawberry.ts; petal — цвет обрезков
];
const DAISY = 0;

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

/** Где сейчас цветок в px холста: основание стебля, головка и её радиус. Общая мера для рисунка и покоса. */
export type FlowerShape = { x: number; headX: number; headY: number; r: number; stem: number; bend: number; open: number };

export function flowerShape(f: Flower, width: number, full: number, ground: number, shown: number, now: number): FlowerShape {
  const x = f.at * width;
  const bloom = f.born ? Math.min(1, (now - f.born) / BLOOM_MS) : 1;
  const open = 1 - Math.pow(1 - bloom, 3);
  const bend = Math.max(-1, Math.min(1, f.bend));
  if (f.kind === STRAWBERRY) return bushShape(x, ground, full, shown, open, bend);
  const stem = stemLength(f.kind, f.at, full) * (0.45 + 0.55 * open);
  return {
    x, stem, bend, open,
    headX: x + bend * stem * 0.5,
    headY: ground - stem * (1 - 0.15 * bend * bend),
    r: (2.7 + 1.9 * shown) * open,
  };
}

/**
 * Номера цветов для посетителей. Пчела помнит номер своего цветка; если цветок срезан,
 * его номер пустеет (пчела выбирает другой), а номера остальных не сдвигаются, пока
 * на лугу есть посетитель. Без посетителей нумерация снова совпадает с садом.
 */
export function createFlowerSlots(list: () => Flower[], busy: () => boolean) {
  let slots: (Flower | null)[] = [];
  const sync = () => {
    const now = list();
    if (!busy()) {
      slots = now.slice();
      return slots;
    }
    slots = slots.map(f => (f && now.includes(f) ? f : null));
    for (const f of now) if (!slots.includes(f)) slots.push(f);
    return slots;
  };
  return {
    heads: () => sync().map(f => (f?.hx !== undefined && f.hy !== undefined ? { x: f.hx, y: f.hy } : undefined)),
    at: (i: number) => sync()[i] ?? undefined,
  };
}

export function drawFlower(ctx: CanvasRenderingContext2D, f: Flower, width: number, full: number, ground: number, shown: number, dark: boolean, now: number) {
  const shape = flowerShape(f, width, full, ground, shown, now);
  const { x, stem, bend, headX, headY, r } = shape;
  if (f.kind === STRAWBERRY) {
    f.hx = headX;
    f.hy = headY;
    drawStrawberryBush(ctx, shape, ground, f.at, f.ripe, now, dark);
    return;
  }
  const curve: Stem = { x, ground, cx: x + bend * stem * 0.1, cy: ground - stem * 0.5, headX, headY, len: stem, bend };
  ctx.beginPath();
  ctx.moveTo(x, ground + 0.5);
  ctx.quadraticCurveTo(curve.cx, curve.cy, headX, headY);
  ctx.strokeStyle = dark ? "hsla(105, 32%, 42%, 0.95)" : "hsla(105, 38%, 32%, 0.95)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  drawLeaves(ctx, f.kind, curve, shape.open, dark);
  f.hx = headX;
  f.hy = headY;
  const kind = FLOWER_KINDS[f.kind];
  if (r < 0.3) return;
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
  if (f.kind === DAISY && !dark) daisyVeins(ctx, r, kind.n, kind.long);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = kind.center;
  ctx.fill();
  ctx.restore();
}
