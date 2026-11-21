// Reduced motion and the calm meadow at rest.
import assert from "node:assert/strict";
import { KEY, turns, withMeadow } from "../harness/meadow.mjs";

const noGuests = { [KEY.guests]: JSON.stringify({ bee: false, butterfly: false }) };

export default [
  ["the meadow sprouts on open, but appears grown at once with reduced motion", async ctx => {
    const heights = {};
    for (const reducedMotion of ["no-preference", "reduce"]) {
      await withMeadow(ctx, { rows: turns(50), reducedMotion, waitFor: "none" }, async m => {
        await m.ready(150);
        const early = (await m.grass())[0];
        await m.run(2000);
        heights[reducedMotion] = [early, (await m.grass())[0]];
      });
    }
    const [early, grown] = heights["no-preference"];
    assert.ok(early < grown - 10, `grows in: ${early} -> ${grown}`);
    assert.deepEqual(heights.reduce, [grown, grown], "reduced motion: full height from the first frame");
  }],

  ["brushed grass sways and comes back exactly to rest", ctx => withMeadow(ctx, { rows: turns(40), storage: noGuests }, async m => {
    const rest = await m.pixels();
    const box = await m.box();
    const y = box.y + box.height * 0.7;
    await m.page.mouse.move(box.x + box.width * 0.4, y);
    await m.page.mouse.move(box.x + box.width * 0.4 + 80, y, { steps: 8 });
    await m.run(80);
    const swaying = await m.pixels();
    assert.notEqual(swaying, rest, "the grass bends under the pointer");
    await m.run(50);
    assert.notEqual(await m.pixels(), swaying, "and keeps swaying");
    await m.page.mouse.move(1, 1);
    await m.run(4500);
    assert.equal(await m.pixels(), rest);
  })],

  ["with reduced motion the grass leans under the pointer without swaying", ctx => withMeadow(ctx, { rows: turns(40), reducedMotion: "reduce" }, async m => {
    const rest = await m.pixels();
    const box = await m.box();
    await m.page.mouse.move(box.x + box.width * 0.55, box.y + box.height - 3);
    const leaning = await m.pixels();
    assert.notEqual(leaning, rest);
    await m.run(1000);
    assert.equal(await m.pixels(), leaning, "nothing moves by itself");
    await m.page.mouse.move(1, 1);
    assert.equal(await m.pixels(), rest);
  })],

  ["a hidden tab draws nothing and catches up when shown again", ctx => withMeadow(ctx, { rows: turns(40), waitFor: "none" }, async m => {
    await m.ready(100);
    await m.bb(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const growing = (await m.grass())[0];
    await m.run(3000);
    assert.equal((await m.grass())[0], growing, "frames stop while hidden");
    await m.bb(() => {
      delete document.visibilityState;
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await m.run(500);
    assert.ok((await m.grass())[0] > growing + 10, "growth finishes once visible");
  })],
];
