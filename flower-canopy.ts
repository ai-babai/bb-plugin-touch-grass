/**
 * Высота травы вокруг цветка — опора для его стебля.
 *
 * Берётся естественный локальный силуэт, а не абсолютный максимум: 70-й перцентиль
 * собственной высоты (Blade.h) видимых травинок в окрестности ±NEAR_PX. Высота стоящей
 * травы, без учёта покоса и отрастания, — поэтому срез косой над цветком не дёргает его.
 * Считается редко: при новой раскладке травинок, новом цветке и заметной смене роста луга.
 */
import type { Blade } from "./blades";

const NEAR_PX = 16;
const PERCENTILE = 0.7;
const FALLBACK = 0.7; // доля полной высоты, если вокруг ещё нет травинок

type Entry = { key: string; value: number };

export function createFlowerCanopy() {
  const cache = new WeakMap<object, Entry>();
  let layout = 0; // номер раскладки травинок

  const measure = (blades: Blade[], x: number, visibleUpTo: number) => {
    const near: number[] = [];
    for (const b of blades) {
      if (b.appear <= visibleUpTo && Math.abs(b.x - x) <= NEAR_PX) near.push(b.h);
    }
    if (!near.length) return FALLBACK;
    near.sort((a, b) => a - b);
    return near[Math.min(near.length - 1, Math.floor(near.length * PERCENTILE))];
  };

  return {
    /** Травинки перестроены (ширина, тред). */
    relayout() {
      layout++;
    },
    /** Доля полной высоты луга (0..1), на которой стоит масса травы у точки x, px. */
    at(owner: object, blades: Blade[], x: number, visibleUpTo: number) {
      const key = `${layout}:${Math.round(x)}:${Math.round(visibleUpTo * 20)}`;
      const hit = cache.get(owner);
      if (hit?.key === key) return hit.value;
      const value = measure(blades, x, visibleUpTo);
      cache.set(owner, { key, value });
      return value;
    },
  };
}
