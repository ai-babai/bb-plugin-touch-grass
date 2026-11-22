// Scythe and flowers in Overgrown on an Android-like touch screen: the blade levels every blade
// standing above its line, flowers included or not, and takes a flower only when it crosses it.
import assert from "node:assert/strict";
import { CLOCK_START, COLORS, KEY, THREAD, turns, withMeadow } from "../harness/meadow.mjs";


const FLOWERS = [{ at: 0.42, kind: 0 }, { at: 0.58, kind: 3 }];
const android = {
  rows: turns(0), viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625,
  size: "overgrown", reducedMotion: "reduce",
  storage: { [KEY.guests]: '{"bee":false,"butterfly":false}', [KEY.garden]: JSON.stringify(FLOWERS.map(f => ({ ...f, planted: CLOCK_START - 3 * 60_000 }))),
    [`bb-touch-grass:overgrown:${THREAD}`]: JSON.stringify({ v: 1, p: 40, s: CLOCK_START - 41 * 60_000, c: [] }) },
};

/** The two planted flowers still on the bed (natural blooming may add others elsewhere). */
const ours = async m => (await m.garden()).filter(f => FLOWERS.some(p => p.at === f.at)).map(f => f.at);

/** Tallest grass-coloured pixel per narrow column band, CSS px over the roots. */
function bandTops(m, centres, half = 0.012) {
  return m.canvas.evaluate((el, { centres, half }) => {
    const { width: w, height: h } = el;
    const dpr = w / el.clientWidth;
    const rgba = el.getContext("2d").getImageData(0, 0, w, h).data;
    const green = i => rgba[i + 3] > 72 && rgba[i + 1] > rgba[i] && rgba[i + 1] > rgba[i + 2];
    return centres.map(c => {
      let top = h;
      for (let x = Math.floor((c - half) * w); x <= (c + half) * w; x++) {
        for (let y = 0; y < top; y++) if (green((y * w + x) * 4)) { top = y; break; }
      }
      return (h - top) / dpr;
    });
  }, { centres, half });
}

/** A finger drags the scythe horizontally across [from, to] at `above` CSS px over the roots. */
async function pass(m, from, to, above) {
  const box = await m.box();
  const y = box.y + box.height - above;
  // Like a person, put the finger down on a blade that stands at this height.
  const start = await m.bb(({ x0, x1, y }) => {
    for (let i = 0; i <= 200; i++) {
      const x = x0 + (x1 - x0) * i / 200;
      if (document.elementFromPoint(x, y)?.closest(".tg-hit")) return x;
    }
    return null;
  }, { x0: box.x + box.width * from, x1: box.x + box.width * to, y });
  assert.ok(start !== null, `standing grass at ${Math.round(above)}px takes the finger`);
  from = (start - box.x) / box.width;
  const cdp = await m.context.newCDPSession(m.page);
  const at = f => [{ x: box.x + box.width * f, y, radiusX: 6, radiusY: 6 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(from) });
  for (let i = 1; i <= 30; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(from + (to - from) * i / 30) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await m.run(300);
}

export default [
  ["Overgrown on touch: a high pass levels all grass beside the flowers, a low pass takes both flowers", ctx =>
    withMeadow(ctx, android, async m => {
      await m.page.waitForFunction(() => {
        const strip = document.querySelector(".tg-meadow").getBoundingClientRect();
        return document.querySelector(".tg-canvas").getBoundingClientRect().top < strip.top - 150;
      });
      const { height } = await m.box();
      assert.deepEqual(await ours(m), [0.42, 0.58], "two flowers in the middle of the lawn");
      const heads = (await m.seen([COLORS.petals[0], COLORS.petals[3]])).map(head => height - head.y);
      assert.equal(heads.length, 2, "two coloured buds on growing stems");
      await m.scytheButton.tap();

      const high = Math.round(Math.max(...heads) + 15);
      await pass(m, 0.08, 0.95, high);
      const near = [0.40, 0.42, 0.44, 0.56, 0.58, 0.60];
      const far = [0.25, 0.75];
      const level = await bandTops(m, [...near, ...far]);
      assert.ok(level.every(t => t <= high + 3), `nothing stands above the first line (${high}px), not even beside the flowers: ${level.map(Math.round)}`);
      assert.deepEqual(await ours(m), [0.42, 0.58], "the blade passed above both flowers");

      const low = Math.round(Math.min(...heads) * 0.5);
      await pass(m, 0.30, 0.70, low);
      assert.deepEqual(await ours(m), [], `the low pass at ${low}px crossed both stems`);
      const flat = await bandTops(m, near);
      assert.ok(flat.every(t => t <= low + 3), `an even line at ${low}px where the flowers stood: ${flat.map(Math.round)}`);
      assert.ok(Math.max(...flat) - Math.min(...flat) <= 6, `level: ${flat.map(Math.round)}`);
    })],
];
