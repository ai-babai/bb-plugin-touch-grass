// Visitors: a bee comes to flowers, a butterfly to the grass; they shy away from the
// pointer and the mower, can be switched off, and keep still with reduced motion.
import assert from "node:assert/strict";
import { COLORS, KEY, turns, withMeadow } from "../harness/meadow.mjs";

const flowerBed = (extra = {}) => ({
  rows: turns(50),
  storage: { [KEY.size]: "full", [KEY.garden]: JSON.stringify([{ at: 0.5, kind: 0 }]) },
  ...extra,
});
const predictable = m => m.bb(() => { Math.random = () => 0.15; });
const bee = async m => (await m.seen([COLORS.bee]))[0];
/** Waits until the bee holds still (sits) and returns where. */
async function settled(m) {
  let last = await bee(m);
  for (let i = 0; i < 80; i++) {
    await m.run(200);
    const now = await bee(m);
    if (last && now && Math.hypot(now.x - last.x, now.y - last.y) < 0.3) return now;
    last = now;
  }
  throw new Error("the bee never settled");
}
const butterfly = async m => (await m.seen(COLORS.butterflies))[0];

async function changeMotion(m, reducedMotion) {
  // Chromium delivers a media-query change on its own render clock.
  await m.bb(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    window.motionChanged = new Promise(resolve => query.addEventListener("change", () => resolve(true), { once: true }));
  });
  await m.page.emulateMedia({ reducedMotion });
  await m.page.waitForFunction(() => window.motionChanged, undefined, { timeout: 3000 });
}

export default [
  ["a bee visits the flower and flies off when the pointer comes close", ctx => withMeadow(ctx, flowerBed(), async m => {
    await predictable(m);
    await m.run(7000);
    assert.ok(await bee(m), "a bee arrives");
    const sitting = await settled(m);
    const { width } = await m.box();
    assert.ok(Math.abs(sitting.x - width / 2) < 10, `the bee sits on the flower: ${sitting.x} of ${width}`);
    const pointer = await m.at(sitting.x, sitting.y);
    await m.page.mouse.move(pointer.x - 4, pointer.y);
    await m.page.mouse.move(pointer.x, pointer.y, { steps: 2 });
    await m.run(1000);
    const away = await bee(m);
    assert.ok(Math.hypot(away.x - sitting.x, away.y - sitting.y) > 40, `scared away: ${sitting.x} -> ${away.x}`);
  })],

  ["with two flowers a startled bee moves over to the other one", ctx => withMeadow(ctx, flowerBed({
    storage: { [KEY.size]: "full", [KEY.garden]: JSON.stringify([{ at: 0.3, kind: 0 }, { at: 0.7, kind: 3 }]) },
  }), async m => {
    await predictable(m);
    await m.run(7000);
    const first = await settled(m);
    const { width } = await m.box();
    const flowers = [0.3 * width, 0.7 * width];
    const on = flowers.findIndex(x => Math.abs(first.x - x) < 10);
    assert.ok(on >= 0, `sits on a flower: ${first.x}`);
    const pointer = await m.at(first.x, first.y);
    await m.page.mouse.move(pointer.x - 4, pointer.y);
    await m.page.mouse.move(pointer.x, pointer.y, { steps: 2 });
    await m.page.mouse.move(1, 1);
    await m.run(1500);
    const next = await settled(m);
    assert.ok(Math.abs(next.x - flowers[1 - on]) < 10, `moved to the other flower: ${first.x} -> ${next.x}`);
  })],

  ["the mower drives a visitor away long before it would leave", ctx => withMeadow(ctx, flowerBed(), async m => {
    await predictable(m);
    await m.run(9000);
    assert.ok(await bee(m));
    await m.mowButton.click();
    await m.run(9000);
    await m.forget();
    await m.run(500);
    assert.equal(await bee(m), undefined);
  })],

  ["the butterfly flies through intermediate positions without jumping", ctx => withMeadow(ctx, {
    rows: turns(50), viewport: { width: 400, height: 740 }, storage: { [KEY.size]: "full" },
  }, async m => {
    await predictable(m);
    await m.run(5500);
    let last = await butterfly(m);
    assert.ok(last, "a butterfly has arrived");
    let distance = 0;
    for (let i = 0; i < 80; i++) {
      await m.run(90);
      const next = await butterfly(m);
      const step = Math.hypot(next.x - last.x, next.y - last.y);
      assert.ok(step < 14, `continuous flight: ${step}px between frames`);
      distance += step;
      last = next;
    }
    assert.ok(distance > 30, "the butterfly crosses the grass");
  })],
  ["a butterfly visits the grass; switched off it disappears and nobody comes", ctx => withMeadow(ctx, { rows: turns(50) }, async m => {
    await predictable(m);
    await m.run(7000);
    assert.ok(await butterfly(m), "without flowers a butterfly comes");
    assert.equal(await bee(m), undefined, "a bee needs flowers");
    await m.toggle.click();
    await m.page.getByRole("button", { name: "Бабочка", exact: true }).click();
    await m.toggle.click();
    await m.forget();
    await m.run(60_000);
    assert.deepEqual(await m.seen([COLORS.bee, ...COLORS.butterflies]), [], "no visitors while they are switched off");
    await m.toggle.click();
    await m.page.getByRole("button", { name: "Бабочка", exact: true }).click();
    await m.toggle.click();
    await m.run(20_000);
    assert.ok(await butterfly(m), "switched back on, the butterfly returns");
  })],

  ["switching the bee off while it visits removes it at once", ctx => withMeadow(ctx, flowerBed(), async m => {
    const empty = await m.pixels();
    await predictable(m);
    await m.run(7000);
    assert.ok(await bee(m));
    await m.toggle.click();
    await m.page.getByRole("button", { name: "Пчела", exact: true }).click();
    await m.page.keyboard.press("Escape");
    await m.page.mouse.move(1, 1);
    await m.run(4000);
    await m.forget();
    await m.run(15_000);
    assert.equal(await bee(m), undefined);
    assert.ok(await butterfly(m), "the butterfly may still come");
    assert.notEqual(await m.pixels(), empty);
  })],

  ["with reduced motion a visitor keeps still, ignores the pointer and leaves quietly", ctx => withMeadow(ctx, flowerBed({ reducedMotion: "reduce" }), async m => {
    const empty = await m.pixels();
    await predictable(m);
    await m.run(7000);
    const still = await bee(m);
    assert.ok(still, "the bee is already on the flower");
    const withBee = await m.pixels();
    const pointer = await m.at(still.x, still.y);
    await m.page.mouse.move(pointer.x, pointer.y, { steps: 3 });
    await m.page.mouse.move(1, 1);
    await m.run(5000);
    assert.deepEqual(await bee(m), still, "it does not move");
    assert.equal(await m.pixels(), withBee);
    await m.run(12_000);
    assert.equal(await m.pixels(), empty, "after a while it is gone without a trace");
  })],

  ["turning reduced motion on settles a flying visitor and stops the mower", ctx => withMeadow(ctx, flowerBed(), async m => {
    await predictable(m);
    await m.run(6500);
    assert.ok(await bee(m));
    await changeMotion(m, "reduce");
    await m.run(100);
    const settled = await bee(m);
    await m.run(3000);
    assert.deepEqual(await bee(m), settled, "the bee holds still");
    await changeMotion(m, "no-preference");
    const before = await m.grass([0.69, 0.84]);
    await m.mowButton.click();
    await m.run(300);
    await changeMotion(m, "reduce");
    await m.run(100);
    await m.forget();
    await m.run(300);
    assert.deepEqual(await m.seen([COLORS.mower]), [], "the mower is gone");
    assert.ok((await m.grass([0.69, 0.84]))[0] < before[0] / 2, "and its pass is finished at once");
  })],
];
