import type { Blade } from "./blades";

export const STUBBLE = 0.16; // доля высоты, что остаётся после покоса газонокосилкой
export const REGROW_MS = 60_000; // полное отрастание без новых ходов

/** Доля полной высоты, до которой травинка отросла после покоса. */
export function regrowth(b: Blade, now: number) {
  if (!b.cutAt) return 1;
  const p = (now - b.cutAt) / REGROW_MS;
  const base = b.cutTo ?? STUBBLE;
  if (p < 1) return base + (1 - base) * p * p * (3 - 2 * p);
  b.cutAt = 0;
  return 1;
}
/** Доля показанного луга, с которой видны травинки: при прорастании они появляются по порогу appear. */
export function visibleShare(shown: number) {
  return 0.08 + 0.92 * shown;
}

/** Длина травинки сейчас (вдоль стебля, без наклона), px: прорастание и отрастание после покоса. */
export function bladeLength(b: Blade, full: number, visibleUpTo: number, now: number) {
  if (b.appear > visibleUpTo) return 0;
  // Только что появившиеся травинки мягко подрастают.
  const emerge = Math.min(1, (visibleUpTo - b.appear) / 0.12);
  return full * b.h * (0.35 + 0.65 * emerge) * regrowth(b, now);
}

/** Насколько верхушка поднята над землёй относительно длины: наклон её опускает. */
function tipRise(b: Blade) {
  const bend = Math.max(-1.15, Math.min(1.15, b.bend));
  const ratio = Math.min(1, Math.abs(b.lean + bend * 0.8));
  return 1 - 0.32 * ratio * ratio;
}

/**
 * Видимая высота верхушки над землёй, px — с прорастанием, отрастанием и наклоном.
 * Общая мера для рисования и ручного среза: коса режет то, что видно под пальцем.
 */
export function visibleBladeHeight(b: Blade, full: number, visibleUpTo: number, now: number) {
  const h = bladeLength(b, full, visibleUpTo, now);
  return h < 1 ? 0 : h * tipRise(b);
}

export function renderBlade(ctx: CanvasRenderingContext2D, b: Blade, width: number, ground: number, full: number, visibleUpTo: number, seedsVisible: boolean, now: number) {
  if (b.x < -6 || b.x > width + 6) return false;
  const h = bladeLength(b, full, visibleUpTo, now);
  if (h < 1) return false;
  paintBlade(ctx, b, h, ground, seedsVisible);
  return b.cutAt !== 0;
}

function paintBlade(ctx: CanvasRenderingContext2D, b: Blade, h: number, ground: number, seedsVisible: boolean) {
  const w = b.w * (0.6 + 0.4 * Math.min(1, h / 24));
  const bend = Math.max(-1.15, Math.min(1.15, b.bend));
  const dx = (b.lean + bend * 0.8) * h;
  const tipX = b.x + dx;
  const tipY = ground - h * tipRise(b);
  const cx = b.x + b.lean * h * 0.15 + bend * h * 0.18;
  const cy = ground - h * 0.55;
  ctx.beginPath();
  ctx.moveTo(b.x - w / 2, ground + 0.5);
  ctx.quadraticCurveTo(cx - w * 0.35, cy, tipX, tipY);
  ctx.quadraticCurveTo(cx + w * 0.35, cy, b.x + w / 2, ground + 0.5);
  ctx.closePath();
  ctx.fillStyle = b.fill;
  ctx.fill();
  if (b.depth > 0.6 && h > 14) {
    ctx.beginPath();
    ctx.moveTo(b.x, ground);
    ctx.quadraticCurveTo(cx, cy, tipX, tipY);
    ctx.strokeStyle = b.rib;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  if (b.seed && seedsVisible && h > 26 && !b.cutAt) {
    ctx.save();
    ctx.translate(tipX, tipY + 2);
    ctx.rotate(Math.atan2(dx, h) * 0.9);
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.4, 3.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = b.fill;
    ctx.fill();
    ctx.restore();
  }
}
