// Wild strawberry: a low bush of green trefoils with berries on their own stalks, not a flower.
// The first bee landing on it ripens the green berries red; ripeness is saved once per thread and shown after a reload. A scythe passing above it spares it;
// the mower takes it with the grass.
import assert from "node:assert/strict";
import { COLORS, KEY, turns, withMeadow } from "../harness/meadow.mjs";

const LEAF = "#2f7a2c";
const GREEN_BERRY = "#b4d288";
const bed = (garden, extra = {}) => ({ rows: turns(50), storage: { [KEY.size]: "full", [KEY.garden]: JSON.stringify(garden) }, ...extra });
const predictable = m => m.bb(() => { Math.random = () => 0.15; });
const berry = async m => (await m.seen([COLORS.berry]))[0];
const countGardenWrites = m => m.bb(key => {
  window.__gardenWrites = 0;
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (k === key) window.__gardenWrites++; return set.call(this, k, v); };
}, KEY.garden);

async function drag(m, from, to, above = 0.2) {
  const box = await m.box();
  const y = box.y + box.height * (1 - above);
  await m.page.mouse.move(box.x + box.width * from, y);
  await m.page.mouse.down();
  await m.page.mouse.move(box.x + box.width * to, y, { steps: 24 });
  await m.page.mouse.up();
  await m.page.mouse.move(1, 1);
}

export default [
  ["a bee ripens the strawberry once; a high scythe and a reload keep the berry, the mower takes it", ctx => withMeadow(ctx, bed([{ at: 0.5, kind: 4 }]), async m => {
    assert.ok((await m.seen([LEAF]))[0], "green trefoils of a low bush");
    assert.deepEqual(await m.seen(COLORS.petals), [], "no flower petals: it is a bush, not a flower");
    const green = (await m.seen([GREEN_BERRY]))[0];
    const { height } = await m.box();
    assert.ok(green && green.y > height * 0.6, `green berries hang low on their own stalks: ${green?.y} of ${height}`);
    assert.equal(await berry(m), undefined, "no red berry before a bee");
    await predictable(m);
    await countGardenWrites(m);
    await m.run(27_000);
    assert.deepEqual(await m.garden(), [{ at: 0.5, kind: 4, ripe: true }]);
    assert.equal(await m.bb(() => window.__gardenWrites), 1, "ripeness is saved once despite repeated visits");
    const { width } = await m.box();
    const ripe = await berry(m);
    assert.ok(ripe && Math.abs(ripe.x - width / 2) < 20, `a red berry hangs by the flower: ${ripe?.x} of ${width}`);

    await m.scytheButton.click();
    await drag(m, 0.4, 0.6, 0.95); // the blade passes above the flower and the berry
    await m.page.keyboard.press("Escape");
    await m.run(600);
    await m.forget();
    await m.run(300);
    assert.ok(await berry(m), "a scythe above the plant spares it");
    await m.reload();
    assert.ok(await berry(m), "ripe at once after a reload");
    assert.deepEqual(await m.garden(), [{ at: 0.5, kind: 4, ripe: true }]);
    await m.mowButton.click();
    await m.run(6000);
    await m.forget();
    await m.run(300);
    assert.equal(await berry(m), undefined, "the mower takes the strawberry with its berry");
    assert.deepEqual(await m.garden(), []);
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
