// A planted stem physically grows in the meadow, keeps its age and responds to Grow now.
import assert from "node:assert/strict";
import { CLOCK_START, KEY, THREAD, turns, withMeadow } from "../harness/meadow.mjs";

const minute = 60_000;
const matureGrass = {
  [KEY.guests]: '{"bee":false,"butterfly":false}',
  [`bb-touch-grass:overgrown:${THREAD}`]: JSON.stringify({ v: 1, p: 40, s: CLOCK_START - 41 * minute, c: [] }),
};

async function waitForSprout(m) {
  await m.run(15_000);
  // Follow this one plant for its entire lifetime.
  await m.bb(key => localStorage.setItem(key, String(Date.now() + 60 * 60_000)), KEY.bloom);
  assert.equal((await m.garden()).length, 1);
}

const stemHeight = m => m.root.locator(".tg-flower-stems").evaluate(path => {
  const root = path.getPointAtLength(0);
  const head = path.getPointAtLength(path.getTotalLength());
  return Math.round(root.y - head.y);
});

const options = {
  size: "overgrown", storage: matureGrass, rows: turns(50), random: 0.1,
  isMobile: true, hasTouch: true, viewport: { width: 390, height: 780 }, reducedMotion: "reduce",
};

export default [
  ["a stem starts low, rises while time passes and keeps its height across a reload", ctx =>
    withMeadow(ctx, options, async m => {
      await waitForSprout(m);
      const young = await stemHeight(m);
      await m.page.clock.fastForward(5 * minute);
      await m.run(4200);
      const halfway = await stemHeight(m);
      await m.reload();
      const reopened = await stemHeight(m);
      await m.page.clock.fastForward(6 * minute);
      await m.run(4200);
      const grown = await stemHeight(m);
      assert.ok(young >= 3 && halfway > young + 5 && grown > halfway + 5 && grown > young * 2,
        `stem above its roots at 0, 5 and 11 minutes: ${young}, ${halfway}, ${grown}px`);
      assert.ok(Math.abs(reopened - halfway) <= 2, `the same stem after reload: ${halfway} -> ${reopened}`);
    })],
  ["Grow now raises a young flower even when the grass is already mature", ctx =>
    withMeadow(ctx, options, async m => {
      await waitForSprout(m);
      const young = await stemHeight(m);
      await m.toggle.tap();
      await m.root.locator(".tg-grow-now").tap();
      await m.run(1000);
      const grown = await stemHeight(m);
      assert.ok(grown > young * 2, `boost raises the flower: ${young} -> ${grown}`);
      await m.reload();
      assert.equal(await stemHeight(m), grown);
    })],
];
