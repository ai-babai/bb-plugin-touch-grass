import type { Blade } from "./blades";
import { bladeLength, bladeWidth, tipRise } from "./draw-blade";

/**
 * Поверхность попаданий «Зарослей»: прозрачный слой размером с холст, обрезанный
 * clip-path по профилю текущих высот травы. Над стоящей травой указатель ловит
 * луг, а в прокосе, над стерней и вне травы родной hit-test отдаёт событие чату.
 *
 * Профиль считается из геометрии стеблей (без чтения пикселей холста), не чаще
 * PROFILE_MS и только когда высоты могли измениться: рост, покос, отрастание,
 * смена размера. Посетители и цветы на профиль не влияют и не обрезаются —
 * clip-path стоит на отдельном слое, а не на холсте.
 */

const BIN_PX = 4; // ширина столбца профиля, CSS px
const PAD_PX = 3; // запас над верхушкой и по бокам: стебли качаются и клонятся
const MIN_HIT_PX = 6; // ниже этого трава (свежий прокос) клики не забирает
const PROFILE_MS = 120;
const SETTLE_MS = 2000;
const EMPTY_CLIP = "polygon(0px 0px, 0px 0px, 0px 0px)";

export type ProfileInput = {
  blades: Blade[];
  width: number;
  height: number;
  full: number;
  visibleUpTo: number;
  now: number;
};

/**
 * Отмечает стебель в покое так, как его рисует paintBlade: кривая от основания
 * через (lean·h·0.15, 0.55·h) к верхушке (lean·h, h·tipRise). У наклонённой
 * травинки над основанием высота меньше, чем у верхушки, — столбцы получают
 * высоту стебля в своём месте, а не высоту верхушки на всём размахе наклона.
 */
function markBlade(bins: number[], b: Blade, h: number) {
  const reach = b.lean * h;
  const rise = h * tipRise(b, 0);
  const half = bladeWidth(b, h) / 2;
  const steps = Math.ceil(Math.abs(reach) / 2) + 4;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = b.x + reach * (0.3 * t * (1 - t) + t * t);
    const y = 1.1 * h * t * (1 - t) + rise * t * t;
    const side = half * ((1 - t) ** 2 + 0.7 * t * (1 - t)); // контур сужается к верхушке
    const from = Math.max(0, Math.floor((x - side) / BIN_PX));
    const to = Math.min(bins.length - 1, Math.floor((x + side) / BIN_PX));
    for (let i = from; i <= to; i++) if (y > bins[i]) bins[i] = y;
  }
}

/** Высоты по столбцам: максимум длины стеблей, расширенный на соседей (качание). */
export function columnHeights({ blades, width, full, visibleUpTo, now }: ProfileInput): number[] {
  const bins = new Array<number>(Math.max(1, Math.ceil(width / BIN_PX))).fill(0);
  for (const b of blades) {
    const h = bladeLength(b, full, visibleUpTo);
    if (h >= MIN_HIT_PX) markBlade(bins, b, h);
  }
  return bins.map((h, i) => Math.max(h, bins[i - 1] ?? 0, bins[i + 1] ?? 0));
}

/** clip-path polygon в локальных px слоя: лесенка по столбцам слева направо, без самопересечений. */
export function profilePolygon(heights: number[], width: number, height: number): string {
  const points: string[] = [`0px ${height}px`];
  let prev = height;
  heights.forEach((h, i) => {
    const top = h >= MIN_HIT_PX ? Math.round(Math.max(0, height - h - PAD_PX)) : height;
    if (top === prev) return; // ровный участок — одна ступенька
    const x = Math.min(width, i * BIN_PX);
    points.push(`${x}px ${prev}px`, `${x}px ${top}px`);
    prev = top;
  });
  if (points.length === 1) return EMPTY_CLIP; // трава нигде не забирает указатель
  points.push(`${width}px ${prev}px`, `${width}px ${height}px`);
  return `polygon(${points.join(", ")})`;
}

/**
 * request — перерисовать луг: пересчёт, отложенный троттлингом, всё равно случится,
 * даже если кадров больше нет (reduced motion, покой).
 */
export function createHitArea(el: HTMLElement | null, request: () => void) {
  let last = -Infinity;
  let stale = true;
  let applied = "";
  let timer = 0;

  const apply = (clip: string) => {
    if (!el || clip === applied) return;
    applied = clip;
    el.style.clipPath = clip;
  };

  const later = (ms: number) => {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      request();
    }, ms);
  };

  return {
    /** Высоты могли измениться (рост, покос, размер): пересчитать при ближайшей отрисовке. */
    invalidate() {
      stale = true;
    },
    /** Зовётся из отрисовки; changing — идёт отрастание или прорастание. */
    update(input: ProfileInput, changing: boolean, enabled: boolean) {
      if (!el || !enabled) return;
      const age = input.now - last;
      // Кадр без перемен в траве (летает насекомое) профиль не трогает; редкий пересчёт ловит часы зарослей.
      const due = stale || age >= (changing ? PROFILE_MS : SETTLE_MS);
      if (!due) return;
      if (age < PROFILE_MS) {
        later(PROFILE_MS - age);
        return;
      }
      last = input.now;
      stale = false;
      if (el.style.height !== `${input.height}px`) el.style.height = `${input.height}px`;
      apply(profilePolygon(columnHeights(input), input.width, input.height));
    },
    dispose() {
      window.clearTimeout(timer);
    },
  };
}
