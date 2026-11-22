// Bees land only on open flowers: a sprout, a closed bud or a red strawberry is not a target.
// With only green growth the bee does not come (a butterfly may); once the bud opens, it lands.
import assert from "node:assert/strict";
import { CLOCK_START, COLORS, KEY, NO_BLOOM, turns, withMeadow } from "../harness/meadow.mjs";

// Half grown: a closed bud on a full stem (flower-growth: bud from 0.15, petals only after 0.7).
const SPROUT = { at: 0.3, kind: 1, planted: CLOCK_START - 5 * 60_000 };
const DAISY = { at: 0.7, kind: 0 };
const phone = (garden, guests = { bee: true, butterfly: false }) => ({
  rows: turns(50), viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  storage: { [KEY.size]: "full", [KEY.guests]: JSON.stringify(guests), [KEY.garden]: JSON.stringify(garden), ...NO_BLOOM() },
});
const predictable = m => m.bb(() => { Math.random = () => 0.15; });
const bee = async m => (await m.seen([COLORS.bee]))[0];
const butterfly = async m => (await m.seen(COLORS.butterflies))[0];

/** Follows the bee until it holds still; returns every resting spot seen on the way. */
async function restingSpots(m, ms) {
  const spots = [];
  let last;
  for (let t = 0; t < ms; t += 200) {
    await m.run(200);
    const now = await bee(m);
    if (last && now && Math.hypot(now.x - last.x, now.y - last.y) < 0.3) spots.push(now.x);
    last = now;
  }
  return spots;
}

export default [
  ["a bee-only meadow receives its first bee when its bud opens without a reload", ctx =>
    withMeadow(ctx, phone([SPROUT], { bee: true, butterfly: false }), async m => {
      await predictable(m);
      await m.run(10_000);
      assert.equal(await bee(m), undefined);
      await m.page.clock.fastForward(6 * 60_000);
      await m.run(25_000);
      assert.ok(await bee(m), "the open bud attracted a bee in this same meadow");
    })],
  ["a bee picks the open daisy, never the closed bud beside it", ctx => withMeadow(ctx, phone([SPROUT, DAISY]), async m => {
    await predictable(m);
    const { width } = await m.box();
    const spots = await restingSpots(m, 16_000);
    assert.ok(spots.length, "the bee came and sat down");
    assert.ok(spots.every(x => Math.abs(x - width * DAISY.at) < 14), `only on the daisy (${width * DAISY.at}): ${spots.map(Math.round)}`);
  })],

  ["only green growth: no bee comes, a butterfly may; the opened bud then takes a bee", ctx =>
    withMeadow(ctx, phone([SPROUT], { bee: true, butterfly: true }), async m => {
      await predictable(m);
      await m.run(9000);
      assert.equal(await bee(m), undefined, "nothing to land on for a bee");
      assert.ok(await butterfly(m), "the butterfly visits the grass instead");
      await m.page.clock.fastForward(6 * 60_000); // the bud opens into a cornflower
      await m.bb(() => localStorage.setItem("bb-touch-grass:guests", '{"bee":true,"butterfly":false}'));
      await m.reload();
      await predictable(m);
      const { width } = await m.box();
      const spots = await restingSpots(m, 16_000);
      assert.ok(spots.some(x => Math.abs(x - width * SPROUT.at) < 14), `the bee lands on the matured flower: ${spots.map(Math.round)}`);
    })],
];
