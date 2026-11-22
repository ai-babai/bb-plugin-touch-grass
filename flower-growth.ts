/**
 * Рост полевых цветов 0–3 (ромашка, василёк, клевер, лютик) по реальному времени.
 *
 * Дата посадки planted — Date.now() в мс, хранится в саду треда. Цветок без даты
 * (старые записи, «Вырастить сейчас») — зрелый. Земляника (kind 4) не растёт этим путём.
 *
 * Стадии по доле g = (Date.now() − planted) / FLOWER_GROW_MS:
 *   0    — росток: стебель 0.4 зрелого, светлые весенние листья, узнаётся с первого кадра;
 *   0.15 — завязывается бутон; листья в полный размер к 0.4, ростковая зелень до 0.35;
 *   0.5  — стебель 0.93 зрелого: бутон над травой;
 *   0.7  — бутон раскрывается, лепестки растут до полной головки к 1, стебель в полный рост.
 */
/** Что нужно знать о цветке (garden.ts Flower; свой тип — без цикла импортов). */
type Flower = { kind: number; planted?: number };

export const FLOWER_GROW_MS = 10 * 60_000;
const GROWING_KINDS = 4; // виды 0..3 и одуванчик
/** Одуванчик (kind 5) растёт как полевые цветы, цветёт жёлтым, затем превращается в белый шарик. */
export const DANDELION = 5;
const YELLOW_MS = 5 * 60_000;
const TURN_MS = 2 * 60_000;

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const grows = (kind: number) => kind < GROWING_KINDS || kind === DANDELION;

/** Доля роста 0..1 на момент wall (Date.now). */
export function flowerAge(f: Flower, wall = Date.now()) {
  if (f.planted === undefined || !grows(f.kind)) return 1;
  return clamp((wall - f.planted) / FLOWER_GROW_MS);
}

/** Одуванчик: 0 — жёлтый цветок, 1 — белый шарик семян. Без даты посадки — уже шарик. */
export function seedPhase(f: Flower, wall = Date.now()) {
  if (f.kind !== DANDELION) return 0;
  if (f.planted === undefined) return 1;
  return smooth(clamp((wall - f.planted - FLOWER_GROW_MS - YELLOW_MS) / TURN_MS));
}

/** Когда растение перестанет меняться само (Date.now, мс). */
function settledAt(f: Flower) {
  return f.planted! + FLOWER_GROW_MS + (f.kind === DANDELION ? YELLOW_MS + TURN_MS : 0);
}

/** Множители стадии: стебель, листья, бутон (доля полной головки), лепестки. */
export function flowerStage(g: number) {
  const petals = smooth(clamp((g - 0.7) / 0.3));
  return {
    stem: 0.4 + 0.6 * (1 - (1 - g) ** 3), // невысокий росток; бутон к 0.5 уже почти в полный рост
    leaf: 0.8 + 0.2 * clamp(g / 0.4),
    bud: 0.75 * clamp((g - 0.15) / 0.45) * (1 - petals),
    petals,
  };
}

/** Новый цветок вида kind растёт с нуля; земляника — сразу кустик. */
export function plantedAt(kind: number, wall = Date.now()) {
  return grows(kind) ? wall : undefined;
}

/** Что-то ещё растёт или одуванчик ещё не стал шариком: лугу нужна редкая перерисовка. */
export function anyGrowing(flowers: Flower[], wall = Date.now()) {
  return flowers.some(f => grows(f.kind) && f.planted !== undefined && wall < settledAt(f));
}

/** Когда созреет последний растущий цветок (Date.now, мс); 0 — все зрелые. */
export function flowersReadyAt(flowers: Flower[], wall = Date.now()) {
  let ready = 0;
  for (const f of flowers) if (grows(f.kind) && f.planted !== undefined && wall < settledAt(f)) ready = Math.max(ready, settledAt(f));
  return ready;
}

/** «Вырастить сейчас»: все цветы зрелые. true — сад изменился. */
export function matureFlowers(flowers: Flower[]) {
  let changed = false;
  for (const f of flowers) {
    if (f.planted === undefined) continue;
    f.planted = undefined;
    changed = true;
  }
  return changed;
}
