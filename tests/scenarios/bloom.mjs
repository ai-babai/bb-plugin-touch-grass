// Natural blooming: flowers open by themselves over real time, without gestures.
import assert from "node:assert/strict";
import { COLORS, KEY, THREAD, turns, withMeadow } from "../harness/meadow.mjs";

const quiet = { [KEY.guests]: '{"bee":false,"butterfly":false}' };
const MIN = 60_000;
const hide = (m, hidden) => m.bb(on => {
  if (on) {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  } else {
    delete document.visibilityState;
    delete document.hidden;
  }
  document.dispatchEvent(new Event("visibilitychange"));
}, hidden);

export default [
  ["a fresh chat shows a flower by itself, then more over minutes, within the flower bed", ctx => withMeadow(ctx, { rows: turns(0), storage: quiet, random: 0.15 }, async m => {
    assert.deepEqual(await m.garden(), [], "not at once");
    await m.run(MIN);
    assert.equal((await m.garden()).length, 1, "the first flower opens within a minute, untouched");
    assert.equal((await m.seen(COLORS.sproutLeaves)).length, 1, "the new plant has visible leaves");
    await m.run(20_000);
    assert.equal((await m.garden()).length, 1, "the next one takes longer");
    await m.bb(() => { Math.random = () => 0.99; });
    await m.run(2 * MIN);
    assert.ok((await m.garden()).some(plant => plant.kind === 4 && plant.ripe), "a wild strawberry plant can grow by itself");
    await m.page.clock.fastForward(60 * MIN);
    const bed = (await m.garden()).length;
    assert.ok(bed >= 2 && bed <= 3, `more flowers over time, never past the fresh bed of 3: ${bed}`);
    await m.page.clock.fastForward(60 * MIN);
    assert.equal((await m.garden()).length, bed, "a full bed stays as it is");
  })],

  ["reloads do not multiply flowers", ctx => withMeadow(ctx, { rows: turns(20), storage: quiet, random: 0.15 }, async m => {
    await m.run(MIN);
    const garden = await m.garden();
    assert.equal(garden.length, 1);
    for (let i = 0; i < 3; i++) await m.reload();
    await m.run(10_000);
    assert.deepEqual(await m.garden(), garden, "the schedule lives in storage, not in the page");
  })],

  ["a hidden tab waits; after a long absence only one flower opens", ctx => withMeadow(ctx, { rows: turns(50), storage: quiet, random: 0.15 }, async m => {
    await hide(m, true);
    await m.page.clock.fastForward(30 * MIN);
    assert.deepEqual(await m.garden(), [], "nothing blooms unseen");
    await hide(m, false);
    await m.run(5000);
    assert.equal((await m.garden()).length, 1, "one flower, not all the missed ones");
  })],

  ["Overgrown blooms too, and with reduced motion the flower is simply there", ctx => withMeadow(ctx, {
    size: "overgrown", reducedMotion: "reduce", rows: turns(0), storage: quiet, random: 0.15,
  }, async m => {
    await m.run(MIN);
    const garden = await m.garden();
    assert.equal(garden.length, 1);
    assert.ok(garden[0].at > 0.05 && garden[0].at < 0.95, `away from the edges: ${garden[0].at}`);
    assert.equal((await m.seen(COLORS.sproutLeaves)).length, 1);
  })],

  ["wild cornflowers and clover sometimes come up as a small clump of separate stems", ctx => withMeadow(ctx, {
    rows: turns(50), random: 0.3, storage: quiet,
  }, async m => {
    await m.run(MIN);
    const clump = await m.garden();
    const { width } = await m.box();
    assert.equal(clump.length, 3, "one natural bloom, three stems");
    assert.ok(clump.every(f => f.kind === 1), "of one kind (a cornflower)");
    const xs = clump.map(f => f.at * width).sort((a, b) => a - b);
    assert.ok(xs[2] - xs[0] < 20 && xs[1] - xs[0] > 3 && xs[2] - xs[1] > 3, `close but not on top of each other: ${xs}`);
    assert.equal(new Set(clump.map(f => f.planted)).size, 3, "stems of slightly different age, not identical columns");
    await m.reload();
    assert.deepEqual(await m.garden(), clump, "a clump is plain garden records and survives a reload");
  })],

  ["a full bed and open settings hold blooming back", ctx => withMeadow(ctx, {
    rows: turns(0), storage: { ...quiet, [KEY.garden]: JSON.stringify([{ at: 0.2, kind: 0 }, { at: 0.5, kind: 1 }, { at: 0.8, kind: 2 }]) },
  }, async m => {
    await m.page.clock.fastForward(30 * MIN);
    assert.equal((await m.garden()).length, 3, "the bed of a fresh chat is full");
    await m.toggle.click();
    await m.bb(id => window.bb.append(id, Array.from({ length: 50 }, () => ({ type: "turn/started", data: {} }))), THREAD);
    await m.run(10 * MIN);
    assert.equal((await m.garden()).length, 3, "nothing opens behind the settings");
    await m.toggle.click();
    await m.run(5 * MIN);
    assert.ok((await m.garden()).length > 3, "the grown chat has room again");
  })],
];
