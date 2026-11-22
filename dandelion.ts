/**
 * Одуванчик (kind 5): прикорневая розетка зубчатых листьев, жёлтая корзинка, которая
 * со временем закрывается и раскрывается белым ажурным шариком семян. При встряхивании
 * пальцем или мышью пушинки на ножках срываются и улетают, шарик редеет.
 *
 * Модуль владеет рисунком одуванчика, геометрией его листьев для покоса и касаний и
 * полётом пушинок. Когда он жёлтый и когда шарик — решает flower-growth (seedPhase);
 * сколько пушинок осталось — поле seeds в саду (garden.ts). Без импортов garden (без циклов).
 */

export const SEEDS = 24;
const GOLDEN = 2.39996; // золотой угол: семена ложатся по шарику без рядов
const YELLOW = "#f2c12e";
const YELLOW_DEEP = "#d9a21b";
const RECEPTACLE = "#b8a878"; // донце шарика, к нему крепятся семена
const ACHENE = "#9a8a60"; // семянка улетающей пушинки
const SHAKE_STEP = 0.16; // «энергия встряски» на одну пушинку: резкий взмах срывает несколько, а не все
const SHAKE_FROM = 0.8; // скорость наклона, ниже которой стебель просто качается
const FLY_MS = 4200;

/** Что модулю нужно знать о растении (garden.ts Flower). */
export type Plant = { kind: number; at: number; bend: number; vel: number; seeds?: number; hx?: number; hy?: number };
type Oval = { x: number; y: number; rx: number; ry: number; rot: number };

/** Порядок облетания: семена уходят вразброс, а не по кругу. */
const rank = (i: number) => (i * 7) % SEEDS;
export const seedsLeft = (p: Plant) => Math.max(0, Math.min(SEEDS, p.seeds ?? SEEDS));

/** Радиус шарика при радиусе корзинки r и фазе семян 0..1. */
export function puffRadius(r: number, phase: number) {
  return r * (1 + 0.55 * phase);
}

// --- Розетка ---------------------------------------------------------------

const ROSETTE = [-1.25, -0.55, 0.5, 1.2]; // наклоны листьев от вертикали

/** Размер листа розетки, как у листьев других цветов (flower-art leafSize). */
export function rosetteSize(stem: number, leaf: number) {
  return Math.max(5, Math.min(11, stem * 0.3)) * leaf;
}

/** Листья розетки как эллипсы: та же раскладка, что и рисунок (покос и слой касаний). */
export function rosetteOvals(x: number, ground: number, size: number, bend: number): Oval[] {
  if (size < 1.5) return [];
  return ROSETTE.map((a, i) => {
    const len = size * (i % 2 ? 1.25 : 1.55);
    const rot = a + bend * 0.2;
    return { x: x + Math.sin(rot) * len * 0.5, y: ground - Math.cos(rot) * len * 0.5, rx: size * 0.24, ry: len * 0.5, rot };
  });
}

/** Зубчатый («львиный») лист вдоль оси вверх: зубцы смотрят к основанию. */
function toothedLeaf(ctx: CanvasRenderingContext2D, len: number, w: number) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (const side of [1, -1]) {
    for (let k = 1; k <= 4; k++) {
      const y = -len * (k / 4.6);
      ctx.lineTo(side * w * (0.55 + 0.1 * k), y + len * 0.06);
      ctx.lineTo(side * w * 0.25, y - len * 0.05);
    }
    ctx.lineTo(0, -len);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawRosette(ctx: CanvasRenderingContext2D, x: number, ground: number, size: number, bend: number, fill: string) {
  if (size < 1.5) return;
  ctx.fillStyle = fill;
  ROSETTE.forEach((a, i) => {
    ctx.save();
    ctx.translate(x, ground);
    ctx.rotate(a + bend * 0.2);
    toothedLeaf(ctx, size * (i % 2 ? 1.25 : 1.55), size * 0.42);
    ctx.restore();
  });
}

// --- Головка ---------------------------------------------------------------

/** Жёлтая корзинка: два венца узких язычков; закрывается к фазе 0.5. */
function yellowHead(ctx: CanvasRenderingContext2D, r: number, phase: number) {
  const close = Math.max(0, 1 - phase * 2); // 1 — раскрыта, 0 — сомкнулась перед шариком
  if (close <= 0) return;
  ctx.fillStyle = YELLOW;
  for (const [n, long] of [[18, 1], [12, 0.7]]) {
    for (let i = 0; i < n; i++) {
      ctx.rotate((Math.PI * 2) / n);
      ctx.beginPath();
      ctx.ellipse(0, -r * long * 0.55 * close, r * 0.13, r * long * 0.5 * close, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = YELLOW_DEEP;
  ctx.fill();
}

/** Пушинка: ножка от донца и зонтик тонких волосков на конце. */
function seedStroke(ctx: CanvasRenderingContext2D, from: number, to: number, fan: number, dark: boolean) {
  ctx.beginPath();
  ctx.moveTo(0, -from);
  ctx.lineTo(0, -to);
  for (let k = -2; k <= 2; k++) {
    const a = k * 0.42;
    ctx.moveTo(0, -to);
    ctx.lineTo(Math.sin(a) * fan, -to - Math.cos(a) * fan);
  }
  ctx.strokeStyle = dark ? "rgba(246, 244, 236, 0.9)" : "rgba(150, 142, 118, 0.75)";
  ctx.lineWidth = 0.45;
  ctx.stroke();
  if (dark) return;
  // На светлом фоне белый зонтик обводится не контуром, а более светлым ядром поверх серой ножки.
  ctx.beginPath();
  for (let k = -2; k <= 2; k++) {
    const a = k * 0.42;
    ctx.moveTo(0, -to);
    ctx.lineTo(Math.sin(a) * fan * 0.8, -to - Math.cos(a) * fan * 0.8);
  }
  ctx.strokeStyle = "rgba(255, 255, 252, 0.95)";
  ctx.lineWidth = 0.35;
  ctx.stroke();
}

/** Белый шарик: оставшиеся пушинки по золотому углу и донце в центре. */
function puffHead(ctx: CanvasRenderingContext2D, r: number, phase: number, left: number, dark: boolean) {
  const open = Math.max(0, phase * 2 - 1); // шарик раскрывается во второй половине
  if (open <= 0) return;
  const R = puffRadius(r, phase) * open;
  for (let i = 0; i < SEEDS; i++) {
    if (rank(i) >= left) continue;
    ctx.save();
    ctx.rotate(i * GOLDEN);
    seedStroke(ctx, R * 0.18, R * (0.62 + 0.12 * ((i * 5) % 3)), R * 0.3, dark);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0.8, R * 0.16), 0, Math.PI * 2);
  ctx.fillStyle = RECEPTACLE;
  ctx.fill();
}

/**
 * Между жёлтым цветком и шариком корзинка сомкнута: зелёная обёртка с отогнутыми листочками
 * внизу и кисточкой на кончике — жёлтой, пока цветок отцветает, белёсой перед шариком.
 */
function closedHead(ctx: CanvasRenderingContext2D, r: number, phase: number, dark: boolean) {
  const c = Math.max(0, 1 - Math.abs(phase - 0.5) / 0.32); // 1 — сомкнута полностью
  if (c <= 0) return;
  const s = r * (0.55 + 0.45 * c);
  ctx.fillStyle = dark ? "#5c9a48" : "#4d8a3b";
  for (const a of [-1.1, 1.1]) { // отогнутые наружные листочки обёртки
    ctx.save();
    ctx.rotate(Math.PI + a * 0.8);
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.35, s * 0.1, s * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.55, s * 0.34, s * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -s * 1.12, s * 0.22, s * 0.16, 0, 0, Math.PI * 2);
  ctx.fillStyle = phase < 0.5 ? YELLOW_DEEP : dark ? "#efeee6" : "#d8d4c4";
  ctx.fill();
}

/** Головка одуванчика в её точке: жёлтая корзинка, затем ажурный шарик. outer — внешний радиус (flowerShape.r). */
export function drawDandelionHead(ctx: CanvasRenderingContext2D, p: Plant, x: number, y: number, outer: number, phase: number, dark: boolean) {
  const r = outer / puffRadius(1, phase);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(p.bend * 0.5);
  ctx.globalAlpha = dark ? 0.92 : 1;
  closedHead(ctx, r, phase, dark);
  yellowHead(ctx, r, phase);
  puffHead(ctx, r, phase, seedsLeft(p), dark);
  ctx.restore();
  heads.set(p, { x, y, r: puffRadius(r, phase), ripe: phase >= 1 });
}

// --- Пушинки ---------------------------------------------------------------

/** Где головка нарисована последний раз и готова ли она облетать. */
const heads = new WeakMap<Plant, { x: number; y: number; r: number; ripe: boolean }>();

type Seed = { x: number; y: number; vx: number; vy: number; born: number; spin: number };

/**
 * Облетание шариков. step — раз в кадр: встряска стебля срывает пушинки, они летят по ветру.
 * onChange — число пушинок у растения изменилось (сохранить сад).
 */
export function createDandelions(onChange: () => void) {
  const flying: Seed[] = [];
  const last = new WeakMap<Plant, { bend: number; energy: number; released?: number }>();

  const release = (p: Plant, count: number, now: number, fly: boolean) => {
    const head = heads.get(p);
    const n = Math.min(count, seedsLeft(p));
    if (!head || n <= 0) return 0;
    p.seeds = seedsLeft(p) - n;
    for (let i = 0; fly && i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const dir = Math.sign(p.vel || p.bend || 1);
      flying.push({
        x: head.x + Math.sin(a) * head.r * 0.7, y: head.y - Math.abs(Math.cos(a)) * head.r * 0.7,
        vx: dir * (12 + Math.random() * 26), vy: -(10 + Math.random() * 18), born: now, spin: Math.random() * 6,
      });
    }
    return n;
  };

  /** Встряска одного шарика; true — сорвались пушинки. */
  const shake = (p: Plant, dt: number, now: number) => {
    const state = last.get(p) ?? { bend: p.bend, energy: 0 };
    const speed = Math.max(Math.abs(p.vel), Math.abs(p.bend - state.bend) / Math.max(dt, 1e-3));
    state.energy = state.energy * Math.exp(-dt * 2) + Math.max(0, speed - SHAKE_FROM) * dt;
    state.bend = p.bend;
    last.set(p, state);
    if (state.energy < SHAKE_STEP || now - (state.released ?? -Infinity) < 100) return false;
    state.energy = 0;
    state.released = now;
    return release(p, 1, now, true) > 0;
  };

  const fly = (dt: number, now: number) => {
    for (let i = flying.length - 1; i >= 0; i--) {
      const s = flying[i];
      s.vx *= Math.exp(-dt * 0.5);
      s.vy = s.vy * Math.exp(-dt * 0.8) + (Math.sin((now - s.born) / 300 + s.spin) * 6 - 1.5) * dt; // парит, едва снижаясь
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (now - s.born > FLY_MS) flying.splice(i, 1);
    }
  };

  return {
    /** Кадр: встряски и полёт. true — нужен следующий кадр. */
    step(plants: Plant[], dt: number, now: number) {
      let changed = false;
      for (const p of plants) if (heads.get(p)?.ripe && seedsLeft(p) > 0 && shake(p, dt, now)) changed = true;
      if (changed) onChange();
      fly(dt, now);
      return flying.length > 0;
    },
    /** Уменьшенное движение: новый неподвижный наклон тихо снимает пару пушинок, без полёта. */
    nudge(plants: Plant[]) {
      let changed = false;
      for (const p of plants) {
        const was = last.get(p)?.bend ?? 0;
        last.set(p, { bend: p.bend, energy: 0 });
        if (was === 0 && p.bend !== 0 && heads.get(p)?.ripe && release(p, 3, 0, false)) changed = true;
      }
      if (changed) onChange();
    },
    paint(ctx: CanvasRenderingContext2D, now: number, dark: boolean) {
      for (const s of flying) {
        const age = (now - s.born) / FLY_MS;
        ctx.save();
        ctx.globalAlpha = Math.min(1, (1 - age) * 3);
        ctx.translate(s.x, s.y);
        ctx.rotate(Math.max(-0.6, Math.min(0.6, s.vx * 0.02)));
        seedStroke(ctx, -2.2, 2.6, 2.2, dark);
        ctx.beginPath();
        ctx.ellipse(0, 2.6, 0.55, 1.3, 0, 0, Math.PI * 2);
        ctx.fillStyle = ACHENE;
        ctx.fill();
        ctx.restore();
      }
    },
    /** Покос, смена размера, уменьшенное движение: пушинки в воздухе пропадают. */
    clear() { flying.length = 0; },
  };
}

export { YELLOW as DANDELION_PETAL };
