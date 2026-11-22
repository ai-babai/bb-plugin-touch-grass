// Above short Overgrown grass, a blossom or stem can be the first thing a finger touches.
// Use a stroke for each stem and a round target for each head, leaving the gaps open to chat.
import { flowerShape, type Flower } from "./garden";

export function createFlowerHits(host: HTMLElement) {
  const stems = host.querySelector<SVGPathElement>(".tg-flower-stems")!;
  const heads = host.querySelector<SVGPathElement>(".tg-flower-heads")!;
  const round = Math.round;
  let previousStems = "", previousHeads = "";

  return (flowers: Flower[], width: number, full: number, shown: number, now: number) => {
    let stemPath = "", headPath = "";
    // The one-pixel SVG is anchored at the roots; its paths can extend above it.
    for (const flower of flowers) {
      const { x, stem, bend, headX, headY, r } = flowerShape(flower, width, full, 1, shown, now);
      const hx = round(headX), hy = round(headY);
      stemPath += `M${round(x)} 1Q${round(x + bend * stem * .1)} ${round(1 - stem * .5)} ${hx} ${hy}`;
      const radius = Math.max(5, Math.ceil(r * 1.5));
      headPath += `M${hx - radius} ${hy}a${radius} ${radius} 0 1 0 ${2 * radius} 0a${radius} ${radius} 0 1 0 ${-2 * radius} 0Z`;
    }
    if (previousStems !== stemPath) stems.setAttribute("d", stemPath);
    if (previousHeads !== headPath) heads.setAttribute("d", headPath);
    previousStems = stemPath;
    previousHeads = headPath;
  };
}
