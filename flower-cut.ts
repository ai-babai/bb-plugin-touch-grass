import { rosetteOvals, rosetteSize } from "./dandelion";
import { leafOvals, type Oval, stemOf } from "./flower-art";
import { tipOval } from "./flower-bud";
import { DANDELION } from "./flower-growth";
import type { FlowerShape } from "./garden";
import { bushParts, STRAWBERRY } from "./strawberry";

/**
 * Попадание лезвия косы в растение: отрезок пути лезвия (в px холста) пересекает
 * стебель, проходит через головку или через видимый лист (у земляники — листочки,
 * ягоды и черешки). Выше растения и в пустоте между листьями — мимо.
 */

type Point = { x: number; y: number };
type Stalk = { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number };

const STEM_HALF_PX = 2; // полутолщина стебля с запасом на дрожание пальца
const HEAD_MARGIN_PX = 1;
const LEAF_MARGIN_PX = 1; // край листа: лезвие, задевшее его кромку, срезает растение
const STALK_HALF_PX = 1.5;

/** Видимые части растения кроме стебля и головки цветка — та же раскладка, что у рисунка. */
export function plantParts(plant: { kind: number; at: number }, shape: FlowerShape, ground: number): { ovals: Oval[]; stalks: Stalk[] } {
  if (plant.kind === STRAWBERRY) return bushParts(shape, ground, plant.at);
  const ovals = plant.kind === DANDELION
    ? rosetteOvals(shape.x, ground, rosetteSize(shape.stem, shape.leaf), shape.bend)
    : leafOvals(plant.kind, stemOf(shape, ground), shape.leaf);
  // Верхушка нераскрытого растения (листочки или бутон) режется и через самый кончик.
  const tip = tipOval(shape.headX, shape.headY, shape.tip ?? 0, shape.bud, shape.bend);
  if (tip) ovals.push(tip);
  return { ovals, stalks: [] };
}

/** Отрезок a→b проходит через эллипс (с запасом margin). */
function segmentHitsOval(o: Oval, a: Point, b: Point, margin: number) {
  const cos = Math.cos(-o.rot), sin = Math.sin(-o.rot);
  const local = (p: Point) => {
    const dx = p.x - o.x, dy = p.y - o.y;
    return { x: (dx * cos - dy * sin) / (o.rx + margin), y: (dx * sin + dy * cos) / (o.ry + margin) };
  };
  return pointToSegment({ x: 0, y: 0 }, local(a), local(b)) <= 1;
}

/** Отрезок a→b задевает квадратичную кривую черешка (по 4 хордам, как стебель). */
function segmentHitsStalk(s: Stalk, a: Point, b: Point, half: number) {
  let previous = { x: s.x0, y: s.y0 };
  for (let step = 1; step <= 4; step++) {
    const t = step / 4, u = 1 - t;
    const point = { x: u * u * s.x0 + 2 * u * t * s.cx + t * t * s.x1, y: u * u * s.y0 + 2 * u * t * s.cy + t * t * s.y1 };
    if (segmentsDistance(a, b, previous, point) <= half) return true;
    previous = point;
  }
  return false;
}

function pointToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function segmentsDistance(a: Point, b: Point, c: Point, d: Point) {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(pointToSegment(a, c, d), pointToSegment(b, c, d), pointToSegment(c, a, b), pointToSegment(d, a, b));
}

/** Лезвие прошло от a к b (точка, если не двигалось): задело ли оно растение — стебель, головку или лист. */
export function scytheHitsFlower(plant: { kind: number; at: number }, shape: FlowerShape, ground: number, a: Point, b: Point) {
  if (pointToSegment({ x: shape.headX, y: shape.headY }, a, b) <= shape.r + HEAD_MARGIN_PX) return true;
  // Follow the same quadratic as the painted stem, including when it bends under a finger.
  const stem = stemOf(shape, ground);
  if (segmentHitsStalk({ x0: stem.x, y0: ground, cx: stem.cx, cy: stem.cy, x1: stem.headX, y1: stem.headY }, a, b, STEM_HALF_PX)) return true;
  const { ovals, stalks } = plantParts(plant, shape, ground);
  return ovals.some(o => segmentHitsOval(o, a, b, LEAF_MARGIN_PX)) || stalks.some(s => segmentHitsStalk(s, a, b, STALK_HALF_PX));
}
