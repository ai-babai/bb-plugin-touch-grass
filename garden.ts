import { daisyVeins, drawLeaves, SPROUT_DARK, SPROUT_LIGHT, type Stem, stemLength } from "./flower-art";
import { bushShape, drawStrawberryBush, LEAF, STRAWBERRY } from "./strawberry";
import { DANDELION, flowerAge, flowerStage, seedPhase } from "./flower-growth";
import { DANDELION_PETAL, drawDandelionHead, drawRosette, puffRadius, rosetteSize, SEEDS } from "./dandelion";

export const BLOOM_MS = 800;
/**
 * kind=4 — не цветок, а низкий кустик земляники (strawberry.ts); kind=5 — одуванчик (dandelion.ts).
 * ripe — у земляники ягоды опылены: время начала покраснения, 0 — уже спелые.
 * В саду хранится однократно как `ripe: true`; без поля — кустик с зелёными ягодами.
 * planted — дата посадки полевого цветка 0–3 и одуванчика, Date.now() мс (flower-growth.ts); без неё цветок зрелый.
 * seeds — сколько пушинок осталось на шарике одуванчика; без поля — полный шарик.
 * Запись сада: { at, kind, ripe?: true, planted?: мс, seeds?: число }.
 */
export type Flower = { at: number; kind: number; born: number; bend: number; vel: number; hx?: number; hy?: number; ripe?: number; planted?: number; mass?: number; room?: number; seeds?: number };
/**
 * mass — высота массы травы у цветка, px, на этот кадр (Grass.tsx, flower-canopy); не хранится.
 * room — высота холста над корнями, px: полный венчик зрелого цветка помещается под его верхним краем.
 */

export const FLOWER_KINDS = [
  { petal: "#f7f4ec", center: "#e7b52c", n: 9, long: 1.55, wide: 0.5 }, // ромашка
  { petal: "#5d82d8", center: "#2c3d78", n: 7, long: 1.35, wide: 0.55 }, // василёк
  { petal: "#d97ba7", center: "#b0557e", n: 10, long: 0.95, wide: 0.6 }, // клевер
  { petal: "#f3c531", center: "#c58b12", n: 5, long: 1.0, wide: 0.85 }, // лютик
  { petal: LEAF, center: LEAF, n: 3, long: 1.0, wide: 0.7 }, // земляника: кустик, рисует strawberry.ts; petal — цвет обрезков
  { petal: DANDELION_PETAL, center: DANDELION_PETAL, n: 18, long: 1.45, wide: 0.3 }, // одуванчик: рисует dandelion.ts; long — шарик больше корзинки
];
const DAISY = 0;

export function gardenCapacity(growth: number) {
  return 3 + Math.round(growth * 9);
}

function gardenKey(threadId: string) {
  return `bb-touch-grass:garden:${threadId}`;
}

/** Сохранённое состояние растения: спелость земляники, дата посадки, оставшиеся пушинки одуванчика. */
function restoreState(flower: Flower, saved: { ripe?: unknown; planted?: unknown; seeds?: unknown }) {
  const { kind } = flower;
  if (kind === STRAWBERRY && saved.ripe === true) flower.ripe = 0;
  if (kind !== STRAWBERRY && typeof saved.planted === "number" && Number.isFinite(saved.planted)) flower.planted = saved.planted;
  if (kind === DANDELION && Number.isInteger(saved.seeds) && (saved.seeds as number) >= 0 && (saved.seeds as number) < SEEDS) flower.seeds = saved.seeds as number;
  return flower;
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
      return [restoreState(flower, f)];
    });
  } catch {
    return [];
  }
}

export function saveGarden(threadId: string, flowers: Flower[]) {
  try {
    window.localStorage.setItem(gardenKey(threadId), JSON.stringify(flowers.map(f => ({
      at: f.at, kind: f.kind,
      ...(f.ripe === undefined ? {} : { ripe: true }),
      ...(f.planted === undefined ? {} : { planted: Math.round(f.planted) }),
      ...(f.seeds === undefined ? {} : { seeds: f.seeds }),
    }))));
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

/**
 * Где сейчас цветок в px холста: основание стебля, головка и её радиус. Общая мера для рисунка,
 * попаданий, посадки пчёл и покоса. r — лепестки; bud — радиус закрытого бутона; leaf — доля листьев.
 */
export type FlowerShape = { x: number; headX: number; headY: number; r: number; stem: number; bend: number; open: number; bud: number; leaf: number; young?: boolean };

export function flowerShape(f: Flower, width: number, full: number, ground: number, shown: number, now: number): FlowerShape {
  const x = f.at * width;
  const bloom = f.born ? Math.min(1, (now - f.born) / BLOOM_MS) : 1;
  const open = 1 - Math.pow(1 - bloom, 3);
  const bend = Math.max(-1, Math.min(1, f.bend));
  if (f.kind === STRAWBERRY) return { ...bushShape(x, ground, full, shown, open, bend), bud: 0, leaf: open };
  const mass = f.mass ?? full * 0.7;
  const head = (2.7 + 1.9 * shown) * (1 + 0.6 * Math.max(0, Math.min(1, (mass - 40) / 160))); // в высоких зарослях головки крупнее
  // Растущий цветок — рост по времени вместо всплывания: росток виден с первого кадра.
  const growing = f.planted !== undefined;
  const age = flowerAge(f);
  const stage = flowerStage(age);
  const pop = growing ? 1 : open;
  // Верх полного венчика (лепесток тянется на long·1.1 радиуса) остаётся под краем холста.
  const roof = (f.room ?? Infinity) - head * FLOWER_KINDS[f.kind].long * 1.1 - 3;
  const stem = Math.max(4, Math.min(stemLength(f.kind, f.at, mass), roof)) * (0.45 + 0.55 * pop) * stage.stem;
  return {
    x, stem, bend, open: pop,
    headX: x + bend * stem * 0.5,
    headY: ground - stem * (1 - 0.15 * bend * bend),
    r: head * pop * stage.petals * (f.kind === DANDELION ? puffRadius(1, seedPhase(f)) : 1), // шарик одуванчика шире корзинки
    bud: head * stage.bud,
    leaf: pop * stage.leaf,
    young: age < 0.35, // росток светлее травы, к бутону зеленеет как взрослый
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
    at: (i: number) => i < 0 ? undefined : sync()[i] ?? undefined,
  };
}

function stemColor(young: boolean | undefined, dark: boolean) {
  if (young) return dark ? SPROUT_DARK : SPROUT_LIGHT;
  return dark ? "hsla(105, 32%, 42%, 0.95)" : "hsla(105, 38%, 32%, 0.95)";
}

/** Закрытый бутон: зелёная чашечка, сквозь которую проступает цвет лепестков. */
function drawBud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, bend: number, petal: string, dark: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(bend * 0.6);
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.35, r * 0.55, r * 0.95, 0, 0, Math.PI * 2);
  ctx.fillStyle = petal;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.75, r * 0.7, 0, 0, Math.PI);
  ctx.fillStyle = dark ? "#5c9a48" : "#4d8a3b";
  ctx.fill();
  ctx.restore();
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
  ctx.strokeStyle = stemColor(shape.young, dark);
  ctx.lineWidth = shape.young ? 1.5 : 1.2;
  ctx.stroke();
  if (f.kind === DANDELION) drawRosette(ctx, x, ground, rosetteSize(stem, shape.leaf), bend, rosetteColor(shape.young, dark));
  else drawLeaves(ctx, f.kind, curve, shape.leaf, dark, shape.young);
  // Пчеле есть куда сесть, когда у ростка появился бутон или головка.
  const head = shape.bud >= 0.3 || r >= 0.3;
  f.hx = head ? headX : undefined;
  f.hy = head ? headY : undefined;
  if (shape.bud >= 0.3) drawBud(ctx, headX, headY, shape.bud, bend, FLOWER_KINDS[f.kind].petal, dark);
  if (r >= 0.3) drawOpenHead(ctx, f, shape, dark);
}

function rosetteColor(young: boolean | undefined, dark: boolean) {
  if (young) return stemColor(true, dark);
  return dark ? "#5a9944" : "#478536";
}

function drawOpenHead(ctx: CanvasRenderingContext2D, f: Flower, shape: FlowerShape, dark: boolean) {
  if (f.kind === DANDELION) drawDandelionHead(ctx, f, shape.headX, shape.headY, shape.r, seedPhase(f), dark);
  else drawHead(ctx, f.kind, shape, dark);
}

/** Раскрытая головка: лепестки по кругу и сердцевина. */
function drawHead(ctx: CanvasRenderingContext2D, kindIndex: number, { x, headX, headY, bend, r }: FlowerShape, dark: boolean) {
  const kind = FLOWER_KINDS[kindIndex];
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
  if (kindIndex === DAISY && !dark) daisyVeins(ctx, r, kind.n, kind.long);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = kind.center;
  ctx.fill();
  ctx.restore();
}
