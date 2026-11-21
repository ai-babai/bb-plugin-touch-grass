import type { Blade } from "./blades";
import { BLOOM_MS, type Flower } from "./garden";

const STIFFNESS = 20; // упругость стебля
const DAMPING = 6.2; // демпфирование: мягкое плавное возвращение
export const REACH = 30; // радиус касания курсора, px

function advanceSpring(plant: {bend: number; vel: number}, dt: number, limit: number) {
  if (plant.bend === 0 && plant.vel === 0) return false;
  plant.vel += (-STIFFNESS * plant.bend - DAMPING * plant.vel) * dt;
  plant.bend += plant.vel * dt;
  if (plant.bend > limit) { plant.bend = limit; plant.vel = Math.min(0, plant.vel); }
  if (plant.bend < -limit) { plant.bend = -limit; plant.vel = Math.max(0, plant.vel); }
  if (Math.abs(plant.bend) >= 0.0015 || Math.abs(plant.vel) >= 0.0015) return true;
  plant.bend = 0;
  plant.vel = 0;
  return false;
}

export function advancePlants(blades: Blade[], flowers: Flower[], dt: number, now: number) {
  let active = false;
  for (const blade of blades) {
    if (advanceSpring(blade, dt, 1.15)) active = true;
  }
  for (const flower of flowers) {
    if (flower.born && now - flower.born < BLOOM_MS) active = true;
    else flower.born = 0;
    if (advanceSpring(flower, dt, Infinity)) active = true;
  }
  return active;
}

function brushWeight(distance: number) {
  return Math.exp(-3 * (distance / REACH) ** 2);
}

export function brushPlants(blades: Blade[], flowers: Flower[], px: number, py: number, width: number, height: number, full: number, dx: number) {
  const push = Math.max(-36, Math.min(36, dx));
  for (const b of blades) {
    const distance = b.x - px;
    if (Math.abs(distance) > REACH || py < height - full * b.h - 6) continue;
    b.vel += push * 0.11 * brushWeight(distance) * b.pliancy;
  }
  for (const f of flowers) {
    const distance = f.at * width - px;
    if (Math.abs(distance) <= REACH) f.vel += push * 0.07 * brushWeight(distance);
  }
}

// --- Палец ---------------------------------------------------------------
export const TOUCH_REACH = 52; // палец прижимает траву шире, чем курсор (REACH)
const PRESS_BEND = 0.95; // наклон травинки прямо под пальцем
const PRESS_FOLLOW = 0.35; // доля пути к целевому наклону за кадр 60 fps
const STILL_BEND = 0.65; // reduced motion: неподвижный наклон

function touchWeight(distance: number) {
  return Math.exp(-2 * (distance / TOUCH_REACH) ** 2);
}

/**
 * Куда клонится травинка под пальцем: lean = 0 — в стороны от пальца,
 * ±1 — вся трава уложена по направлению свайпа; между ними — смесь.
 */
function pressDirection(distance: number, lean: number) {
  return lean + (1 - Math.abs(lean)) * Math.sign(distance || 1);
}

/** Удерживаемый палец: управляемый наклон, пружина не спорит с ним, пока палец на траве. */
export function pressPlants(blades: Blade[], flowers: Flower[], px: number, lean: number, width: number, dt: number) {
  const follow = 1 - Math.pow(1 - PRESS_FOLLOW, Math.max(0, dt) * 60);
  for (const b of blades) {
    const distance = b.x - px;
    if (Math.abs(distance) > TOUCH_REACH) continue;
    const target = pressDirection(distance, lean) * PRESS_BEND * touchWeight(distance) * Math.min(1, b.pliancy + 0.2);
    b.bend += (target - b.bend) * follow;
    b.vel = 0;
  }
  for (const f of flowers) {
    const distance = f.at * width - px;
    if (Math.abs(distance) <= TOUCH_REACH) f.vel += pressDirection(distance, lean) * 0.02 * touchWeight(distance);
  }
}

/** Reduced motion: трава под пальцем неподвижно раздвинута, без качания. */
export function leanAway(blades: Blade[], px: number) {
  for (const b of blades) {
    const distance = b.x - px;
    b.vel = 0;
    b.bend = Math.abs(distance) > TOUCH_REACH ? 0 : Math.sign(distance || 1) * STILL_BEND * touchWeight(distance);
  }
}
