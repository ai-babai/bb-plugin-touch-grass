// Cutting flowers: the scythe takes exactly the plant its blade crosses, at the height of the
// gesture; above the plant or beside it nothing happens. The bed is saved per thread, and a bee
// sitting on a flower stays on it when another flower is cut.
import assert from "node:assert/strict";
import { COLORS, KEY, turns, withMeadow } from "../harness/meadow.mjs";

const [DAISY, CORNFLOWER, , BUTTERCUP] = COLORS.petals;
const bed = (garden, extra = {}) => ({
  rows: turns(50),
  storage: { [KEY.size]: "full", [KEY.guests]: '{"bee":false,"butterfly":false}', [KEY.garden]: JSON.stringify(garden) },
  ...extra,
});

/** Scythe stroke between two fractions of the width at `above` CSS px over the roots. */
async function stroke(m, from, to, above) {
  const box = await m.box();
  const y = box.y + box.height - above;
  await m.page.mouse.move(box.x + box.width * from, y);
  await m.page.mouse.down();
  await m.page.mouse.move(box.x + box.width * to, y, { steps: 16 });
  await m.page.mouse.up();
  await m.page.mouse.move(1, 1);
  await m.run(300);
}

/** Petal colours drawn since the page (or the last forget) — the reduced-motion lawn only redraws on change. */
const petals = async m => (await m.seen([DAISY, CORNFLOWER, BUTTERCUP])).map(p => p.x);

export default [
  ["wildflowers form a low, varied border and a mobile scythe can cut one above short grass", ctx =>
    withMeadow(ctx, {
      ...bed([]), size: "overgrown", viewport: { width: 390, height: 790 },
      isMobile: true, hasTouch: true, reducedMotion: "reduce",
      storage: { [KEY.guests]: '{"bee":false,"butterfly":false}',
        [KEY.garden]: JSON.stringify([0, 1, 2, 3].map((kind, i) => ({ kind, at: 0.2 + i * 0.18 }))) },
    }, async m => {
      const box = await m.box();
      const heads = await m.seen(COLORS.petals);
      assert.equal(heads.length, 4);
      const heights = heads.map(head => box.height - head.y);
      assert.ok(Math.max(...heights) < box.height / 3, `low flowers in tall grass: ${heights}`);
      assert.ok(Math.max(...heights) - Math.min(...heights) > 3, `different plant heights: ${heights}`);
      await m.scytheButton.tap();
      const cornflower = heads[1];
      await m.page.touchscreen.tap(box.x + cornflower.x, box.y + cornflower.y);
      assert.deepEqual((await m.garden()).map(plant => plant.kind), [0, 2, 3]);
      await m.reload();
      assert.deepEqual((await m.garden()).map(plant => plant.kind), [0, 2, 3]);
    })],

  ["the scythe cuts only the flower its blade crosses; above and beside it are spared; reload keeps the bed", ctx =>
    withMeadow(ctx, bed([{ at: 0.3, kind: 0 }, { at: 0.5, kind: 1 }, { at: 0.7, kind: 3 }], { reducedMotion: "reduce" }), async m => {
      const bloom = await petals(m);
      assert.equal(bloom.length, 3, `three flowers bloom: ${bloom}`);
      const { height } = await m.box();
      await m.scytheButton.click();
      await stroke(m, 0.45, 0.55, 12); // through the cornflower stem
      await stroke(m, 0.62, 0.78, height - 2); // high above the buttercup
      await stroke(m, 0.24, 0.285, 12); // close to the daisy, not across it
      await m.page.keyboard.press("Escape");
      assert.deepEqual(await m.garden(), [{ at: 0.3, kind: 0 }, { at: 0.7, kind: 3 }], "only the crossed flower is gone");
      await m.forget();
      const box = await m.box();
      await m.page.mouse.move(box.x + box.width * .1, box.y + box.height - 5); // reduced motion redraws under the pointer
      await m.page.mouse.move(1, 1);
      assert.equal((await m.seen([CORNFLOWER])).length, 0, "the cut flower is no longer drawn");
      assert.equal((await m.seen([DAISY, BUTTERCUP])).length, 2, "its neighbours still are");
      await m.reload();
      assert.deepEqual(await m.garden(), [{ at: 0.3, kind: 0 }, { at: 0.7, kind: 3 }]);
      assert.equal((await petals(m)).length, 2, "the cut flower stays gone after a reload");
    })],

  ["the scythe through the head of a flower cuts it; the reduced-motion mower takes the whole bed at once", ctx =>
    withMeadow(ctx, bed([{ at: 0.4, kind: 0 }, { at: 0.8, kind: 3 }], { reducedMotion: "reduce" }), async m => {
      const head = (await m.seen([DAISY]))[0];
      const box = await m.box();
      await m.scytheButton.click();
      await stroke(m, 0.36, 0.44, box.height - head.y); // at the height of the daisy's head
      await m.page.keyboard.press("Escape");
      assert.deepEqual(await m.garden(), [{ at: 0.8, kind: 3 }]);
      await m.mowButton.click();
      await m.run(100);
      assert.deepEqual(await m.garden(), [], "the mower clears its whole pass without animation");
    })],

  ["a bee keeps its flower when another flower is cut", ctx =>
    withMeadow(ctx, bed([{ at: 0.2, kind: 0 }, { at: 0.5, kind: 1 }, { at: 0.8, kind: 3 }], {
      storage: { [KEY.size]: "full", [KEY.guests]: '{"bee":true,"butterfly":false}',
        [KEY.garden]: JSON.stringify([{ at: 0.2, kind: 0 }, { at: 0.5, kind: 1 }, { at: 0.8, kind: 3 }]) },
    }), async m => {
      await m.bb(() => { Math.random = () => 0.6; }); // the bee picks the middle flower
      const bee = async () => (await m.seen([COLORS.bee]))[0];
      let sitting;
      for (let i = 0; i < 60 && !sitting; i++) {
        await m.run(250);
        const a = await bee();
        await m.run(100);
        const b = await bee();
        if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < 0.3) sitting = b;
      }
      const { width } = await m.box();
      assert.ok(sitting && Math.abs(sitting.x - width * 0.5) < 12, `the bee sits on the middle flower: ${sitting?.x}`);
      await m.scytheButton.click();
      await stroke(m, 0.16, 0.24, 12); // cut the first flower, far from the bee
      await m.page.keyboard.press("Escape");
      assert.deepEqual((await m.garden()).map(f => f.at), [0.5, 0.8]);
      await m.run(400);
      const after = await bee();
      assert.ok(after && Math.abs(after.x - width * 0.5) < 12, `the bee stays on its flower: ${sitting.x} -> ${after?.x}`);
    })],
];
