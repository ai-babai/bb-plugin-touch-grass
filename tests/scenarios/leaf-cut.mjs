// The scythe cuts a plant through its side leaf or berry, away from the stem, while a pass
// through the empty gap beside it keeps the plant. In Overgrown the touch layer has the same leaves.
import assert from "node:assert/strict";
import { KEY, turns, withMeadow } from "../harness/meadow.mjs";

const CLOVER_LEAF = [0x3f, 0x7f, 0x35];
const GREEN_BERRY = [0xb4, 0xd2, 0x88];
const CLOVER = [CLOVER_LEAF];
// Every opaque colour of the bush: leaves, dark leaves, sepals and green berries (stalks are thin strokes).
const BUSH = [[0x2f, 0x7a, 0x2c], [0x28, 0x64, 0x24], [0x4c, 0x8a, 0x36], GREEN_BERRY];
const phone = (garden, size = "full") => ({
  rows: turns(52), viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true,
  storage: { [KEY.size]: size, [KEY.guests]: JSON.stringify({ bee: false, butterfly: false }), [KEY.garden]: JSON.stringify(garden) },
});

/**
 * Where the plant part of colour rgb is drawn, canvas CSS px: the visible pixel farthest from the
 * stem at x0, and edge — the outermost pixel of any plant colour on that side. Only pixels within
 * REACH of the stem count: a few grass blades share these greens elsewhere on the lawn.
 */
const REACH = 30;
function findPart(m, rgb, plant, x0) {
  return m.canvas.evaluate((el, { rgb, plant, x0, reach }) => {
    const dpr = el.width / el.clientWidth;
    const data = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
    const is = (i, c) => data[i + 3] >= 250 && Math.abs(data[i] - c[0]) <= 2 && Math.abs(data[i + 1] - c[1]) <= 2 && Math.abs(data[i + 2] - c[2]) <= 2;
    const xs = [];
    let best = null;
    for (let i = 0; i < data.length; i += 4) {
      const x = ((i / 4) % el.width) / dpr, y = Math.floor(i / 4 / el.width) / dpr;
      if (Math.abs(x - x0) > reach) continue;
      if (plant.some(c => is(i, c))) xs.push(x);
      if (is(i, rgb) && (!best || Math.abs(x - x0) > Math.abs(best.x - x0))) best = { x, y };
    }
    if (!best) return null;
    const side = Math.sign(best.x - x0) || 1;
    return { ...best, side, edge: Math.max(...xs.map(x => (x - x0) * side)) * side + x0 };
  }, { rgb, plant, x0, reach: REACH });
}

/** A scythe stroke with the finger, straight down through canvas point x from y0 to y1. */
async function swipeDown(m, x, y0, y1) {
  const cdp = await m.context.newCDPSession(m.page);
  const box = await m.box();
  const at = y => [{ x: box.x + x, y: box.y + y, radiusX: 3, radiusY: 3 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(y0) });
  for (let i = 1; i <= 6; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(y0 + (y1 - y0) * i / 6) });
    await m.run(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await m.run(200);
}

async function cutThroughSide(m, rgb, plant, what) {
  const { width, height } = await m.box();
  const part = await findPart(m, rgb, plant, width / 2);
  assert.ok(part, `the ${what} is drawn`);
  assert.ok(Math.abs(part.x - width / 2) >= 4.5, `the ${what} reaches beside the stem: ${part.x - width / 2}`);
  await m.scytheButton.tap();
  const gap = part.edge + part.side * 7; // the empty air just past the plant's outermost edge
  await swipeDown(m, gap, Math.max(1, height - 70), height - 1);
  assert.equal((await m.garden()).length, 1, `a pass through the gap beside the ${what} keeps the plant`);
  await swipeDown(m, part.x, part.y - 3, part.y + 3);
  assert.deepEqual(await m.garden(), [], `a short cut through the ${what} alone takes the plant`);
}

export default [
  ["the scythe cuts clover through a side leaf and strawberry through a berry, but not through the gap", async ctx => {
    await withMeadow(ctx, phone([{ at: 0.5, kind: 2 }]), m => cutThroughSide(m, CLOVER_LEAF, CLOVER, "clover leaf"));
    await withMeadow(ctx, phone([{ at: 0.5, kind: 4 }]), m => cutThroughSide(m, GREEN_BERRY, BUSH, "green berry"));
  }],

  ["in Overgrown a finger can start on a side leaf, while the gap beside it stays open to the chat", ctx => withMeadow(ctx, phone([{ at: 0.5, kind: 2 }], "overgrown"), async m => {
    await m.run(500);
    const box = await m.box();
    const part = await findPart(m, CLOVER_LEAF, CLOVER, box.width / 2);
    assert.ok(part, "the clover leaf is drawn");
    const layers = (x, y) => m.page.evaluate(([x, y]) => document.elementsFromPoint(x, y).map(el => el.getAttribute("class") ?? ""), [box.x + x, box.y + y]);
    assert.ok((await layers(part.x, part.y)).some(c => c.includes("tg-flower-heads")), "the leaf takes the touch");
    assert.ok(!(await layers(part.edge + part.side * 9, part.y)).some(c => c.includes("tg-flower")), "the gap beside it does not");
  })],
];
