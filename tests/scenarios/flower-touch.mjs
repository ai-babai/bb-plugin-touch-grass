// Flowers answer the finger and the mouse: the drawn flower head moves away from the touch on either
// side, follows a stroke, ignores a touch above the flower and stands up again after release.
import assert from "node:assert/strict";
import { COLORS, KEY, turns, withMeadow } from "../harness/meadow.mjs";

const PETAL = COLORS.petals[1]; // василёк
const bed = (extra = {}) => ({
  rows: turns(52), viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true,
  storage: { [KEY.size]: "full", [KEY.guests]: JSON.stringify({ bee: false, butterfly: false }), [KEY.garden]: JSON.stringify([{ at: 0.5, kind: 1 }]) },
  ...extra,
});

/** Where the flower head was drawn last, canvas CSS px (reduced motion redraws only on input). */
async function head(m) {
  await m.run(34);
  const [at] = await m.seen([PETAL]);
  assert.ok(at, "the flower is drawn");
  return at;
}

/** Largest sideways shift of the head over a short while. */
async function sway(m, rest, ms = 400) {
  let most = 0;
  for (let t = 0; t < ms; t += 34) most = Math.max(most, Math.abs((await head(m)).x - rest.x));
  return most;
}

/** A finger in canvas CSS px: x across, h above the ground. */
async function finger(m) {
  const cdp = await m.context.newCDPSession(m.page);
  const box = await m.box();
  const send = (type, x, h) => cdp.send("Input.dispatchTouchEvent", {
    type, touchPoints: type === "touchEnd" ? [] : [{ x: box.x + x, y: box.y + box.height - h, radiusX: 5, radiusY: 5 }],
  });
  return { down: (x, h) => send("touchStart", x, h), move: (x, h) => send("touchMove", x, h), up: () => send("touchEnd") };
}

export default [
  ["a pressed flower bends away from the finger on either side, follows a swipe and stands up after release", ctx => withMeadow(ctx, bed(), async m => {
    const rest = await head(m);
    const { width, height } = await m.box();
    const stem = height - rest.y; // the head is this high above the ground
    const base = width / 2;
    const f = await finger(m);

    await f.down(base - 8, stem * 0.5);
    await m.run(300);
    const right = await head(m);
    assert.ok(right.x - rest.x > 8, `a finger on the left bends it right: ${rest.x} -> ${right.x}`);
    await f.up();
    await m.run(2500);
    assert.ok(Math.abs((await head(m)).x - rest.x) < 1, "it stands up again after release");

    await f.down(base + 8, stem * 0.5);
    await m.run(300);
    const left = await head(m);
    assert.ok(rest.x - left.x > 8, `a finger on the right bends it left: ${rest.x} -> ${left.x}`);
    for (let i = 1; i <= 12; i++) { await f.move(base + 8 - i * 4, stem * 0.5); await m.run(16); }
    await m.run(200);
    const swiped = await head(m);
    assert.ok(rest.x - swiped.x > 8, `a swipe to the left lays it down to the left: ${swiped.x}`);
    await f.up();
    await m.run(2500);
    assert.ok(Math.abs((await head(m)).x - rest.x) < 1, "and it recovers");

    await f.down(base - 8, stem + 26);
    await m.run(300);
    assert.ok(Math.abs((await head(m)).x - rest.x) < 1, "a touch in the air above the flower leaves it alone");
    await f.up();
  })],

  ["the mouse brushes a flower; with reduced motion it only tilts still and straightens at once", async ctx => {
    await withMeadow(ctx, bed({ isMobile: false, hasTouch: false }), async m => {
      const rest = await head(m);
      const box = await m.box();
      const y = box.y + rest.y + (box.height - rest.y) * 0.5;
      await m.page.mouse.move(box.x + box.width / 2 - 40, y);
      await m.page.mouse.move(box.x + box.width / 2 + 40, y, { steps: 8 });
      const brushed = await sway(m, rest);
      assert.ok(brushed > 5, `the brushed flower sways by ${brushed.toFixed(1)} px`);
      await m.page.mouse.move(1, 1);
      await m.run(3000);
      assert.ok(Math.abs((await head(m)).x - rest.x) < 1, "and settles");
    });
    await withMeadow(ctx, bed({ reducedMotion: "reduce" }), async m => {
      const rest = await head(m);
      const { width, height } = await m.box();
      const f = await finger(m);
      await f.down(width / 2 + 8, (height - rest.y) * 0.5);
      await m.run(100);
      const tilted = await head(m);
      assert.ok(rest.x - tilted.x > 5, `a still tilt away from the finger: ${rest.x} -> ${tilted.x}`);
      await m.run(1000);
      assert.deepEqual(await head(m), tilted, "no swaying while held");
      await f.up();
      await m.run(100);
      assert.ok(Math.abs((await head(m)).x - rest.x) < 0.5, "upright at once after release");
    });
  }],
];
