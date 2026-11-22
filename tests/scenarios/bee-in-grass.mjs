// A bee landing on a flower that stands in the grass goes into that grass: it is drawn right after
// its flower, so the same front blades are painted over it — also after the settings and with
// reduced motion. Overlap is measured on the real canvas calls, not on internal state.
import assert from "node:assert/strict";
import { KEY, turns, withMeadow } from "../harness/meadow.mjs";

const bed = extra => ({
  rows: turns(50), random: 0.15,
  storage: { [KEY.size]: "full", [KEY.guests]: JSON.stringify({ bee: true, butterfly: false }), [KEY.garden]: JSON.stringify([{ at: 0.28, kind: 2 }]) },
  ...extra,
});

/**
 * Per canvas frame: was the bee drawn before some grass (nested), on top of everything (top),
 * and did a later blade path actually cover a point of the bee body (covered).
 */
const probe = m => m.bb(() => {
  const BEE = "#efb62a", OWN = new Set(["#efb62a", "#2b2414", "rgba(200, 225, 255, 0.75)", "rgba(220, 235, 255, 0.55)"]);
  const stats = { nested: 0, top: 0, covered: 0 };
  let bee = null, after = 0, hit = false;
  const flush = () => {
    if (bee) {
      stats[after ? "nested" : "top"]++;
      if (hit) stats.covered++;
    }
    bee = null; after = 0; hit = false;
  };
  window.__bee = () => { flush(); return { ...stats }; };
  window.__beeReset = () => { flush(); stats.nested = stats.top = stats.covered = 0; };
  const own = c => c.closest?.("[data-bb-plugin]");
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    if (own(this.canvas)) flush();
    return clear.apply(this, args);
  };
  const fill = CanvasRenderingContext2D.prototype.fill;
  CanvasRenderingContext2D.prototype.fill = function (...args) {
    if (own(this.canvas)) {
      const style = String(this.fillStyle);
      if (style === BEE) {
        const t = this.getTransform();
        const r = Math.abs(t.d) * 2; // body ellipse 3.4×2.3 in bee units
        bee = [[0, 0], [-r, 0], [r, 0], [0, -r / 2], [0, r / 2]].map(([dx, dy]) => [t.e + dx, t.f + dy]);
      } else if (bee && !OWN.has(style)) { // grass after the bee, not its own head or wings
        after++;
        if (bee.some(([x, y]) => this.isPointInPath(x, y))) hit = true;
      }
    }
    return fill.apply(this, args);
  };
  Math.random = () => 0.15;
});
const stats = m => m.bb(() => window.__bee());
const reset = m => m.bb(() => window.__beeReset());

async function settings(m) {
  await m.toggle.click();
  await m.run(700);
  await m.toggle.click();
  await m.run(700);
}

export default [
  ["a bee on a flower in the grass is covered by the same front blades", async ctx => {
    await withMeadow(ctx, bed(), async m => {
      await probe(m);
      await m.run(12_000);
      await reset(m);
      await m.run(4000);
      const sitting = await stats(m);
      assert.ok(sitting.nested > 0, `the bee goes into the flower's grass: ${JSON.stringify(sitting)}`);
      assert.ok(sitting.covered > 0, `front blades are painted over the bee: ${JSON.stringify(sitting)}`);
      await settings(m);
      await reset(m);
      await m.run(3000);
      const back = await stats(m);
      assert.ok(back.nested > 0, `still in the grass after the settings: ${JSON.stringify(back)}`);
    });
    await withMeadow(ctx, bed({ reducedMotion: "reduce" }), async m => {
      await probe(m);
      await m.run(7000);
      const still = await stats(m);
      assert.ok(still.nested > 0 && still.top === 0 && still.covered > 0, `with reduced motion the still bee sits in the grass: ${JSON.stringify(still)}`);
      await reset(m);
      await settings(m);
      const back = await stats(m);
      assert.ok(back.nested > 0 && back.top === 0 && back.covered > 0, `and after the settings: ${JSON.stringify(back)}`);
    });
  }],
];
