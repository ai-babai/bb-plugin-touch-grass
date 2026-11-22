// In mature Overgrown the mower and the visitors grow with the tall stems (about ×2), while the
// Tall meadow keeps their old size. Sizes are the scale the figures are actually drawn with.
import assert from "node:assert/strict";
import { COLORS, KEY, turns, withMeadow } from "../harness/meadow.mjs";


const WING = COLORS.butterflies[0];

/** Record the drawn scale and position of every fill colour on the meadow canvas. */
const watchSizes = m => m.bb(() => {
  window.__size = {};
  const fill = CanvasRenderingContext2D.prototype.fill;
  CanvasRenderingContext2D.prototype.fill = function (...args) {
    const t = this.getTransform();
    const dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    window.__size[String(this.fillStyle)] = { s: Math.abs(t.d) / dpr, x: t.e / dpr, y: t.f / dpr };
    return fill.apply(this, args);
  };
  Math.random = () => 0.15;
});
const drawn = (m, color) => m.bb(c => window.__size[c], color);

async function measure(ctx, size, guests) {
  const out = {};
  await withMeadow(ctx, {
    rows: turns(50),
    storage: { "bb-touch-grass:overgrown:thr_meadow": JSON.stringify({ v: 1, p: 40, s: 1, c: [] }),
      [KEY.size]: size, [KEY.guests]: JSON.stringify(guests), [KEY.garden]: JSON.stringify([{ at: 0.5, kind: 0 }]) },
  }, async m => {
    await watchSizes(m);
    out.height = (await m.box()).height;
    await m.run(7000);
    out.guest = await drawn(m, guests.bee ? COLORS.bee : WING);
    if (!guests.bee) return;
    await m.mowButton.click();
    await m.run(700);
    out.mower = await drawn(m, COLORS.mower);
  });
  return out;
}

export default [
  ["mature Overgrown draws the mower, bee and butterfly about twice as big as Tall", async ctx => {
    const sizes = {};
    for (const size of ["full", "overgrown"]) {
      sizes[size] = {
        ...(await measure(ctx, size, { bee: true, butterfly: false })),
        butterfly: (await measure(ctx, size, { bee: false, butterfly: true })).guest,
      };
    }
    const { full: tall, overgrown: over } = sizes;
    const report = JSON.stringify(sizes);
    assert.ok(tall.height <= 72 && over.height > 185, `strip heights: ${report}`);
    assert.ok(tall.guest && tall.mower && tall.butterfly && over.guest && over.mower && over.butterfly, `all figures drawn: ${report}`);
    assert.ok(Math.abs(tall.guest.s - 1.2) < .001, "Tall keeps the old bee size");
    assert.ok(Math.abs(tall.butterfly.s - 1.2) < .001, "Tall keeps the old butterfly size");
    assert.equal(tall.mower.s, 1, "Tall keeps the old mower size");
    for (const figure of ["guest", "butterfly", "mower"]) {
      const ratio = over[figure].s / tall[figure].s;
      assert.ok(ratio >= 1.5 && ratio <= 2.6, `${figure} grows ×${ratio.toFixed(2)} in Overgrown: ${report}`);
    }
    assert.ok(Math.abs(over.mower.y - over.height) <= over.mower.s, `the big mower stays on the ground: ${report}`);
    const wingTop = over.butterfly.y - 5.5 * over.butterfly.s;
    assert.ok(wingTop >= 0, `the big butterfly is not clipped at the top: ${wingTop}`);
  }],
];
