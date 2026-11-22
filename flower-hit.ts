// Above short Overgrown grass, a blossom, stem or leaf can be the first thing a finger touches.
// Use a stroke for each stem and stalk, and filled targets for each head and leaf — the same
// layout as the painted plant (plantParts) — leaving the gaps between them open to the chat.
import { flowerShape, type Flower } from "./garden";
import { plantParts } from "./flower-cut";

const LEAF_PAD_PX = 2; // палец шире кромки листа
const n = (v: number) => Math.round(v * 10) / 10;

/** Повёрнутый эллипс как замкнутый путь SVG из двух дуг. */
function ovalPath(o: { x: number; y: number; rx: number; ry: number; rot: number }) {
  const rx = o.rx + LEAF_PAD_PX, ry = o.ry + LEAF_PAD_PX;
  const dx = rx * Math.cos(o.rot), dy = rx * Math.sin(o.rot);
  const deg = n((o.rot * 180) / Math.PI);
  return `M${n(o.x + dx)} ${n(o.y + dy)}a${n(rx)} ${n(ry)} ${deg} 1 0 ${n(-2 * dx)} ${n(-2 * dy)}a${n(rx)} ${n(ry)} ${deg} 1 0 ${n(2 * dx)} ${n(2 * dy)}Z`;
}

export function createFlowerHits(host: HTMLElement) {
  const stems = host.querySelector<SVGPathElement>(".tg-flower-stems")!;
  const heads = host.querySelector<SVGPathElement>(".tg-flower-heads")!;
  const round = Math.round;
  let previousStems = "", previousHeads = "";

  return (flowers: Flower[], width: number, full: number, shown: number, now: number) => {
    let stemPath = "", headPath = "";
    // The one-pixel SVG is anchored at the roots (ground = 1); its paths can extend above it.
    for (const flower of flowers) {
      const shape = flowerShape(flower, width, full, 1, shown, now);
      const { x, stem, bend, headX, headY, r } = shape;
      const hx = round(headX), hy = round(headY);
      stemPath += `M${round(x)} 1Q${round(x + bend * stem * .1)} ${round(1 - stem * .5)} ${hx} ${hy}`;
      const radius = Math.max(5, Math.ceil(r * 1.5));
      headPath += `M${hx - radius} ${hy}a${radius} ${radius} 0 1 0 ${2 * radius} 0a${radius} ${radius} 0 1 0 ${-2 * radius} 0Z`;
      const { ovals, stalks } = plantParts(flower, shape, 1);
      for (const o of ovals) headPath += ovalPath(o);
      for (const s of stalks) stemPath += `M${n(s.x0)} ${n(s.y0)}Q${n(s.cx)} ${n(s.cy)} ${n(s.x1)} ${n(s.y1)}`;
    }
    if (previousStems !== stemPath) stems.setAttribute("d", stemPath);
    if (previousHeads !== headPath) heads.setAttribute("d", headPath);
    previousStems = stemPath;
    previousHeads = headPath;
  };
}
