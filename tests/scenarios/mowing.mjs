// Mowing with the scythe and with the mower; the mower takes the flower on its way; grass grows back.
import assert from "node:assert/strict";
import { COLORS, KEY, THREAD, turns, withMeadow } from "../harness/meadow.mjs";

const LEFT = [0.24, 0.42], RIGHT = [0.69, 0.84];
const mature = { rows: turns(50), storage: { [KEY.size]: "full", [KEY.garden]: JSON.stringify([{ at: 0.1, kind: 1 }]) } };

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
  ["scythe cuts a path under the pointer, mower cuts the rest and the flower, grass regrows", ctx => withMeadow(ctx, mature, async m => {
    const before = await m.grass(LEFT, RIGHT);
    assert.ok(before[0] > 40 && before[1] > 40, `tall meadow: ${before}`);
    await drag(m, 0.21, 0.46);
    await m.run(4000);
    assert.deepEqual(await m.grass(LEFT, RIGHT), before, "without the scythe a drag only brushes the grass");

    await m.scytheButton.click();
    assert.equal(await m.scytheButton.getAttribute("aria-pressed"), "true");
    await drag(m, 0.21, 0.46);
    await m.run(900);
    const cut = await m.grass(LEFT, RIGHT);
    assert.ok(cut[0] < before[0] / 2 && Math.abs(cut[1] - before[1]) <= 2, `only the path is cut: ${before} -> ${cut}`);
    await m.page.keyboard.press("Escape");
    assert.equal(await m.scytheButton.getAttribute("aria-pressed"), "false", "Escape puts the scythe away");

    await m.forget();
    await m.mowButton.click();
    await m.run(700);
    assert.equal((await m.seen([COLORS.mower])).length, 1, "the mower drives across");
    await m.run(5000);
    const mowed = await m.grass(LEFT, RIGHT);
    assert.ok(mowed[1] < before[1] / 2, `mower cut the rest: ${mowed}`);
    await m.forget();
    await m.run(300);
    assert.deepEqual(await m.seen(COLORS.petals), [], "the mower took the flower off the bed");
    assert.deepEqual(await m.garden(), [], "and the thread remembers it");

    await m.page.clock.fastForward(20 * 60_000); // mowing restarts the lawn clock: 40 minutes by default
    await m.run(300);
    const half = await m.grass(LEFT, RIGHT);
    assert.ok(half[1] > mowed[1] + 5 && half[1] < before[1] - 5, `regrowing: ${half}`);
    await m.page.clock.fastForward(21 * 60_000);
    await m.run(300);
    const regrown = await m.grass(LEFT, RIGHT);
    assert.ok(regrown.every((h, i) => Math.abs(h - before[i]) <= 2), `regrown: ${before} -> ${regrown}`);
  })],

  ["Escape also puts the scythe away when nothing is focused", ctx => withMeadow(ctx, mature, async m => {
    await m.scytheButton.click();
    await m.bb(() => document.activeElement.blur());
    await m.page.keyboard.press("Escape");
    assert.equal(await m.scytheButton.getAttribute("aria-pressed"), "false");
    await m.scytheButton.click();
    await m.toggle.click();
    await m.toggle.click();
    assert.equal(await m.scytheButton.getAttribute("aria-pressed"), "false", "turning the card puts the scythe away");
  })],

  ["with reduced motion the mower cuts at once; a new turn does not speed up regrowth", ctx => withMeadow(ctx, {
    ...mature, rows: turns(20), reducedMotion: "reduce",
  }, async m => {
    const before = await m.grass(LEFT, RIGHT);
    await m.forget();
    await m.mowButton.click();
    await m.run(50);
    assert.deepEqual(await m.seen([COLORS.mower]), [], "no mower animation");
    const mowed = await m.grass(LEFT, RIGHT);
    assert.ok(mowed[0] < before[0] / 2 && mowed[1] < before[1] / 2, `cut at once: ${before} -> ${mowed}`);
    await m.page.clock.fastForward(10 * 60_000);
    await m.run(300);
    const slow = await m.grass(RIGHT);
    await m.bb(id => window.bb.append(id, Array.from({ length: 20 }, () => ({ type: "turn/started", data: {} }))), THREAD);
    await m.run(2100);
    const after = await m.grass(RIGHT);
    assert.ok(Math.abs(after[0] - slow[0]) <= 2, `turns leave regrowth on the clock: ${slow} -> ${after}`);
    await m.page.clock.fastForward(31 * 60_000);
    await m.run(300);
    assert.ok((await m.grass(RIGHT))[0] >= before[1] - 2, "the clock alone finishes regrowth");
  })],
];
