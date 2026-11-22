/**
 * Порядок рисования луга: цветы стоят в траве, а не перед ней. Травинки уже отсортированы
 * по глубине (blades.ts); каждый цветок вставляется на свою глубину, и травинки глубже него —
 * небольшая передняя доля — рисуются поверх его листьев, стебля, местами головки.
 * Глубина цветка устойчива по месту и виду, поэтому рисунок не меняется после ресайза и покоса;
 * скошенные передние травинки короче — после стрижки цветы видны лучше.
 */
import type { Blade } from "./blades";
import type { Flower } from "./garden";

const FRONT_FROM = 0.85; // у самого дальнего цветка перед ним остаётся до 15% травы
const FRONT_SPAN = 0.10; // у ближнего цветка перед ним остаётся около 5%

/** Глубина цветка 0..1 в шкале травинок: ниже — больше травы перед ним. */
function flowerDepth(f: Flower) {
  const s = Math.sin(f.at * 9973.1 + f.kind * 37.7) * 43758.5453;
  return FRONT_FROM + FRONT_SPAN * (s - Math.floor(s));
}

/**
 * Трава и цветы вперемешку по глубине: каждая травинка рисуется ровно один раз.
 * blade возвращает true, если травинка подстрижена; результат — была ли такая.
 */
export function drawLayers(blades: Blade[], flowers: Flower[], blade: (b: Blade) => boolean, flower: (f: Flower) => void) {
  const order = flowers.map(plant => ({ plant, depth: flowerDepth(plant) }));
  order.sort((a, b) => a.depth - b.depth);
  let next = 0;
  let cut = false;
  for (const layer of order) {
    while (next < blades.length && blades[next].depth < layer.depth) {
      if (blade(blades[next++])) cut = true;
    }
    flower(layer.plant);
  }
  while (next < blades.length) {
    if (blade(blades[next++])) cut = true;
  }
  return cut;
}
