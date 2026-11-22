// Mini-game: brushing the grass over the sleeping firefly grows a flower that is kept.
import assert from "node:assert/strict";
import { COLORS, KEY, THREAD, turns, withMeadow } from "../harness/meadow.mjs";

const glow = m => m.page.locator("[data-bb-plugin=touch-grass] .tg-firefly.is-on .tg-firefly-glow");
const center = async locator => {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

async function playFirefly(m) {
  await glow(m).waitFor({ state: "visible" });
  const spot = await center(glow(m));
  const meadow = await m.box();
  assert.ok(spot.x > meadow.x && spot.x < meadow.x + meadow.width && spot.y > meadow.y && spot.y <= meadow.y + meadow.height,
    "the firefly glows inside the meadow");
  await m.stroke(spot.x + 150, spot.y, { sweeps: 10 });
  assert.deepEqual(await m.garden(), [], "brushing far away does not wake it");
  await m.page.mouse.move(spot.x - 22, spot.y);
  await m.page.mouse.move(spot.x + 22, spot.y, { steps: 6 });
  await m.page.mouse.move(1, 1);
  return spot;
}

export default [
  ["one tap or keyboard activation wakes a firefly, and the scythe can pass over it", async ctx => {
    for (const method of ["touch", "keyboard"]) await withMeadow(ctx, {
      size: "overgrown", viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true,
    }, async m => {
      const wake = m.root.getByRole("button", { name: "Разбудить светлячка" });
      await m.scytheButton.tap();
      assert.equal(await wake.isVisible(), false);
      await m.scytheButton.tap();
      const spot = await center(glow(m));
      if (method === "touch") await m.page.touchscreen.tap(spot.x + 10, spot.y);
      else await wake.press("Enter");
      const flowers = await m.garden();
      assert.equal(flowers.length, 1);
      assert.ok(flowers[0].kind < 4, "the firefly grows an ordinary wildflower");
    });
  }],
  ["brushing the firefly grows a flower that survives a reload", async ctx => {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      await withMeadow(ctx, { rows: turns(30), reducedMotion }, async m => {
        assert.equal(await glow(m).count(), 1, `a firefly sleeps in the grass (${reducedMotion})`);
        const spot = await playFirefly(m);
        const garden = await m.garden();
        assert.equal(garden.length, 1, "a flower is saved for this thread");
        const meadow = await m.box();
        assert.ok(Math.abs(garden[0].at * meadow.width - (spot.x - meadow.x)) < 12, "it blooms where the firefly slept");
        await m.forget();
        await m.run(2000);
        assert.equal(await glow(m).count(), 0, "the firefly flew away");
        assert.equal((await m.seen(COLORS.petals)).length, 1, "the flower is drawn");
        await m.run(7000);
        assert.equal(await glow(m).count(), 1, "another firefly settles later");
        await m.reload();
        assert.deepEqual(await m.garden(), garden);
        assert.equal((await m.seen(COLORS.petals)).length, 1, "the saved flower blooms again");
      });
    }
  }],

  ["a full flower bed waits for the chat to grow before a new firefly comes", ctx => withMeadow(ctx, {
    rows: turns(0),
    storage: { [KEY.garden]: JSON.stringify([{ x: 50, kind: 0 }, { at: 0.5, kind: 6 }, { at: 0.9, kind: -1 }, { kind: 2 }, null]) },
  }, async m => {
    assert.equal((await m.garden()).length, 5, "storage untouched until something blooms");
    await m.run(4000);
    assert.equal(await glow(m).count(), 0, "three flowers fill a fresh meadow");
    await m.bb(id => window.bb.append(id, Array.from({ length: 50 }, () => ({ type: "turn/started", data: {} }))), THREAD);
    await m.run(3000);
    assert.equal(await glow(m).count(), 1, "a mature meadow has room for more flowers");
  })],

  ["damaged or blocked flower storage starts an empty bed", async ctx => {
    await withMeadow(ctx, { storage: { [KEY.garden]: "{}" } }, async m => {
      assert.deepEqual(await m.seen(COLORS.petals), [], "no flowers drawn since the page opened");
    });
    await withMeadow(ctx, { storage: { [KEY.garden]: "[oops" } }, async m => {
      assert.equal(await glow(m).count(), 1);
    });
    await withMeadow(ctx, { blockStorage: true, rows: turns(30) }, async m => {
      await playFirefly(m);
      await m.forget();
      await m.run(1000);
      assert.equal((await m.seen(COLORS.petals)).length, 1, "the flower lives for the session");
    });
  }],
];
