import type { FlowerShape } from "./garden";

/**
 * Попадание лезвия косы в цветок: отрезок пути лезвия (в px холста) пересекает
 * стебель или проходит через головку. Выше головки и в стороне от стебля — мимо.
 */

type Point = { x: number; y: number };

const STEM_HALF_PX = 2; // полутолщина стебля с запасом на дрожание пальца
const HEAD_MARGIN_PX = 1;

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

/** Лезвие прошло от a к b (точка, если не двигалось): задело ли оно цветок. */
export function scytheHitsFlower(shape: FlowerShape, ground: number, a: Point, b: Point) {
  const head = { x: shape.headX, y: shape.headY };
  if (pointToSegment(head, a, b) <= shape.r + HEAD_MARGIN_PX) return true;
  let previous = { x: shape.x, y: ground };
  const controlX = shape.x + shape.bend * shape.stem * 0.1;
  const controlY = ground - shape.stem * 0.5;
  // Follow the same quadratic as the painted stem, including when it bends under a finger.
  for (let step = 1; step <= 4; step++) {
    const t = step / 4, u = 1 - t;
    const point = {
      x: u * u * shape.x + 2 * u * t * controlX + t * t * head.x,
      y: u * u * ground + 2 * u * t * controlY + t * t * head.y,
    };
    if (segmentsDistance(a, b, previous, point) <= STEM_HALF_PX) return true;
    previous = point;
  }
  return false;
}
