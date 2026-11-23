import type { Blade } from "./blades";

const TALL_PX = 66; // длина травинки зрелого высокого луга

/** Длина травинки сейчас (вдоль стебля, без наклона), px: прорастание и отрастание после покоса. */
export function bladeLength(b: Blade, full: number, visibleUpTo: number) {
  if (b.appear > visibleUpTo) return 0;
  // Только что появившиеся травинки мягко подрастают.
  const emerge = Math.min(1, (visibleUpTo - b.appear) / 0.12);
  return full * b.h * (0.35 + 0.65 * emerge) * b.grown;
}

/** Насколько верхушка поднята над землёй относительно длины: наклон её опускает. */
export function tipRise(b: Blade, bending = b.bend) {
  const bend = Math.max(-1.15, Math.min(1.15, bending));
  const ratio = Math.min(1, Math.abs(b.lean + bend * 0.8));
  return 1 - 0.32 * ratio * ratio;
}

/**
 * Видимая высота верхушки над землёй, px — с прорастанием, отрастанием и наклоном.
 * Общая мера для рисования и ручного среза: коса режет то, что видно под пальцем.
 */
export function visibleBladeHeight(b: Blade, full: number, visibleUpTo: number) {
  const h = bladeLength(b, full, visibleUpTo);
  return h < 1 ? 0 : h * tipRise(b);
}

/** Рисует травинку; true — она ниже полной длины (покос или молодой луг ещё отрастают). */
export function renderBlade(ctx: CanvasRenderingContext2D, b: Blade, width: number, ground: number, full: number, visibleUpTo: number, seedsVisible: boolean) {
  if (b.x < -6 || b.x > width + 6) return false;
  const h = bladeLength(b, full, visibleUpTo);
  if (h < 1) return false;
  paintBlade(ctx, b, h, ground, seedsVisible);
  return b.grown < 1;
}

/** Ширина травинки длиной h у основания, px. Выше обычного зрелого луга (заросли) стебли шире: силуэт густой, а не штриховой. */
export function bladeWidth(b: Blade, h: number) {
  return b.w * (0.6 + 0.4 * Math.min(1, h / 24)) * (1 + Math.max(0, h - TALL_PX) / 140);
}

function paintBlade(ctx: CanvasRenderingContext2D, b: Blade, h: number, ground: number, seedsVisible: boolean) {
  const w = bladeWidth(b, h);
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
  if (b.seed && seedsVisible && h > 26 && b.grown >= 1) {
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
