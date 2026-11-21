// Wild strawberry: the fifth flower. The first bee landing on it ripens a small red berry
// that is saved once per thread, spared by the scythe and the mower, and shown after a reload.
import assert from "node:assert/strict";
import { COLORS, KEY, turns, withMeadow } from "../harness/meadow.mjs";

const STRAWBERRY_CENTER = "#d9c64a";
const bed = (garden, extra = {}) => ({ rows: turns(50), storage: { [KEY.size]: "full", [KEY.garden]: JSON.stringify(garden) }, ...extra });
const predictable = m => m.bb(() => { Math.random = () => 0.15; });
const berry = async m => (await m.seen([COLORS.berry]))[0];
const countGardenWrites = m => m.bb(key => {
  window.__gardenWrites = 0;
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (k === key) window.__gardenWrites++; return set.call(this, k, v); };
}, KEY.garden);

async function drag(m, from, to) {
  const box = await m.box();
  const y = box.y + box.height * 0.8;
  await m.page.mouse.move(box.x + box.width * from, y);
  await m.page.mouse.down();
  await m.page.mouse.move(box.x + box.width * to, y, { steps: 24 });
  await m.page.mouse.up();
  await m.page.mouse.move(1, 1);
}

export default [
  ["a bee ripens the strawberry once; scythe, mower and reload keep the berry", ctx => withMeadow(ctx, bed([{ at: 0.5, kind: 4 }]), async m => {
    assert.equal((await m.seen([STRAWBERRY_CENTER, ...COLORS.petals])).length, 2, "a white five-petal flower with a yellow heart");
    assert.equal(await berry(m), undefined, "no berry before a bee");
    await predictable(m);
    await countGardenWrites(m);
    await m.run(27_000);
    assert.deepEqual(await m.garden(), [{ at: 0.5, kind: 4, ripe: true }]);
    assert.equal(await m.bb(() => window.__gardenWrites), 1, "ripeness is saved once despite repeated visits");
    const { width } = await m.box();
    const ripe = await berry(m);
    assert.ok(ripe && Math.abs(ripe.x - width / 2) < 20, `a red berry hangs by the flower: ${ripe?.x} of ${width}`);

    await m.scytheButton.click();
    await drag(m, 0.4, 0.6);
    await m.page.keyboard.press("Escape");
    await m.mowButton.click();
    await m.run(6000);
    await m.forget();
    await m.run(300);
    assert.ok(await berry(m), "the scythe and the mower spare it");
    await m.reload();
    assert.ok(await berry(m), "ripe at once after a reload");
    assert.deepEqual(await m.garden(), [{ at: 0.5, kind: 4, ripe: true }]);
  })],

  ["with reduced motion a sitting bee pollinates; older saved gardens still load", ctx => withMeadow(ctx, bed(
    [{ at: 0.5, kind: 4 }, { x: 110, kind: 0 }, { at: 0.8, kind: 2, ripe: true }], { reducedMotion: "reduce" },
  ), async m => {
    assert.equal(await berry(m), undefined, "ripe is ignored on other flowers");
    await predictable(m);
    await m.run(7000);
    assert.equal((await m.seen([COLORS.bee])).length, 1, "the bee sits still on the strawberry");
    assert.ok(await berry(m), "the berry is red at once, without animation");
    const saved = await m.garden();
    assert.deepEqual(saved.map(f => [f.kind, f.ripe]), [[4, true], [0, undefined], [2, undefined]]);
  })],
];
