/**
 * Шкала времени отрастания травы: опорные отметки 5 / 15 / 40 / 90 минут стоят на
 * равных интервалах, внутри интервала минуты распределены равномерно. Выбирается любая
 * целая минута от 5 до 90.
 *
 * Нативный range работает в «делениях»: на каждый интервал — UNITS делений (кратно
 * длине каждого интервала, поэтому каждая минута попадает точно в деление). Позиция
 * ползунка непрерывна, минуты — целые, скачков между опорами нет.
 */

export const REGROW_ANCHORS = [5, 15, 40, 90] as const;
const UNITS = 50; // НОК длин интервалов 10, 25 и 50 мин
export const REGROW_MIN = REGROW_ANCHORS[0];
export const REGROW_MAX = REGROW_ANCHORS[REGROW_ANCHORS.length - 1];
export const SCALE_UNITS = UNITS * (REGROW_ANCHORS.length - 1);

const clampMinutes = (m: number) => Math.max(REGROW_MIN, Math.min(REGROW_MAX, Math.round(m)));

/** Минуты → деления ползунка. */
export function minutesToUnits(minutes: number) {
  const m = clampMinutes(minutes);
  let i = 0;
  while (i < REGROW_ANCHORS.length - 2 && m > REGROW_ANCHORS[i + 1]) i++;
  const from = REGROW_ANCHORS[i], to = REGROW_ANCHORS[i + 1];
  return i * UNITS + ((m - from) / (to - from)) * UNITS;
}

/** Деления ползунка → ближайшая целая минута. */
export function unitsToMinutes(units: number) {
  const u = Math.max(0, Math.min(SCALE_UNITS, units));
  const i = Math.min(REGROW_ANCHORS.length - 2, Math.floor(u / UNITS));
  const from = REGROW_ANCHORS[i], to = REGROW_ANCHORS[i + 1];
  return clampMinutes(from + ((u - i * UNITS) / UNITS) * (to - from));
}

/**
 * Новое значение из ползунка. Палец или мышь (dragging) дают ближайшую минуту. Шаг
 * ассистивной технологии — одно деление — до следующей минуты не дотягивает; без
 * перетаскивания такой шаг двигает ровно на минуту в его сторону.
 */
export function minutesFromInput(units: number, current: number, dragging = false) {
  const next = unitsToMinutes(units);
  if (dragging || next !== current) return next;
  const delta = units - minutesToUnits(current);
  return delta ? clampMinutes(current + Math.sign(delta)) : current;
}

/** Клавиши: стрелки — на минуту, Page — на 5 минут, Home/End — края шкалы. null — не наша клавиша. */
export function minutesForKey(key: string, current: number): number | null {
  const steps: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -5, PageUp: 5 };
  if (key === "Home") return REGROW_MIN;
  if (key === "End") return REGROW_MAX;
  return key in steps ? clampMinutes(current + steps[key]) : null;
}

/** Положение опоры на шкале, 0..1. */
export const anchorShare = (i: number) => i / (REGROW_ANCHORS.length - 1);
