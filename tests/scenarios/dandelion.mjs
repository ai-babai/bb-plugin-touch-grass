// Dandelion: a yellow flower that later turns into a white seed head. Shaking the head with the
// mouse or a finger lets a few seeds fly off and the head thins; the count is kept for the chat.
import assert from "node:assert/strict";
import { CLOCK_START, KEY, turns, withMeadow } from "../harness/meadow.mjs";

const RECEPTACLE = "#b8a878"; // the base of the white seed head
const ACHENE = "#9a8a60"; // a seed in flight
const YELLOW = "#f2c12e";
const quiet = { [KEY.size]: "full", [KEY.guests]: JSON.stringify({ bee: false, butterfly: false }) };
const bed = (plant, extra = {}) => ({ rows: turns(50), storage: { ...quiet, [KEY.garden]: JSON.stringify([plant]) }, ...extra });

/** Brush the mouse back and forth through the stem, below the head. */
async function shake(m, head, sweeps = 6) {
  const box = await m.box();
  const y = box.y + head.y + (box.height - head.y) * 0.4;
  for (let i = 0; i < sweeps; i++) {
    for (const direction of [1, -1]) {
      for (let dx = -28; dx <= 28; dx += 7) {
        await m.page.mouse.move(box.x + head.x + direction * dx, y);
        await m.run(16);
      }
    }
  }
}

export default [
  ["a dandelion can sprout among existing wildflowers and ripen without a gesture", ctx => withMeadow(ctx, {
    ...bed({ at: 0.25, kind: 0 }), random: 0.74, reducedMotion: "reduce",
  }, async m => {
    await m.page.clock.fastForward(121_000);
    const sprout = (await m.garden()).find(plant => plant.kind === 5);
    assert.ok(sprout?.planted, "the meadow planted a dandelion");
    await m.page.clock.fastForward(11 * 60_000);
    await m.run(4200);
    assert.ok((await m.seen([YELLOW])).length, "the new dandelion bloomed yellow");
    await m.page.clock.fastForward(7 * 60_000);
    await m.run(4200);
    assert.ok((await m.seen([RECEPTACLE])).length, "it ripened on its own");
  })],
  ["a ripe dandelion sheds seeds that fly away when shaken; the thinner head is kept", ctx => withMeadow(ctx, bed({ at: 0.5, kind: 5 }), async m => {
    const [head] = await m.seen([RECEPTACLE]);
    assert.ok(head, "a white seed head is drawn");
    assert.deepEqual(await m.seen([YELLOW]), [], "no yellow petals on a seed head");
    assert.deepEqual(await m.seen([ACHENE]), [], "nothing flies before it is touched");

    await m.forget();
    await shake(m, head, 1);
    await m.run(150);
    const [seed] = await m.seen([ACHENE]);
    assert.ok(seed, "seeds fly off");
    assert.ok(seed.y < head.y + 4, `a seed rises from the head: ${seed.y} vs ${head.y}`);

    await m.page.mouse.move(1, 1);
    await m.run(5000);
    const left = (await m.garden())[0].seeds;
    assert.ok(left > 0 && left < 24, `the head thins but is not bare at once: ${left} of 24`);
    await m.forget();
    await m.run(3000);
    assert.deepEqual(await m.seen([ACHENE]), [], "the seeds have flown away");
    assert.equal((await m.garden())[0].seeds, left, "a calm head keeps its seeds");

    await m.reload();
    assert.equal((await m.garden())[0].seeds, left, "the count survives a reload");
    assert.ok((await m.seen([RECEPTACLE])).length, "the thinner head is drawn again");
  })],

  ["a finger can shake an Overgrown seed head without stripping it bare", ctx => withMeadow(ctx, {
    size: "overgrown", hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 },
    storage: { ...quiet, [KEY.size]: "overgrown", [KEY.garden]: JSON.stringify([{ at: 0.5, kind: 5 }]) },
  }, async m => {
    const [head] = await m.seen([RECEPTACLE]);
    const box = await m.box();
    const y = box.y + head.y + (box.height - head.y) * 0.22;
    const touch = await m.context.newCDPSession(m.page);
    const move = (type, dx = 0) => touch.send("Input.dispatchTouchEvent", {
      type, touchPoints: type === "touchEnd" ? [] : [{ x: box.x + head.x + dx, y, radiusX: 3, radiusY: 3 }],
    });
    await move("touchStart");
    for (const dx of [8, 16, 8, 0, -8, -16, -8, 0]) {
      await move("touchMove", dx);
      await m.run(38);
    }
    await move("touchEnd");
    await m.run(150);
    const left = (await m.garden())[0].seeds;
    assert.ok(left > 0 && left < 24, `the finger released part of the head: ${left} seeds remain`);
    assert.ok((await m.seen([ACHENE])).length, "a detached seed was drawn");
  })],

  ["a young dandelion flowers yellow and keeps still under the mouse", ctx => withMeadow(ctx, bed({ at: 0.5, kind: 5, planted: CLOCK_START - 11 * 60_000 }), async m => {
    const [flower] = await m.seen([YELLOW]);
    assert.ok(flower, "the yellow flower is drawn");
    assert.deepEqual(await m.seen([RECEPTACLE]), [], "not a seed head yet");
    await shake(m, flower);
    await m.run(300);
    assert.equal((await m.garden())[0].seeds, undefined, "a yellow flower has no seeds to lose");
    await m.page.clock.fastForward(8 * 60_000);
    await m.run(4500); // the meadow repaints slowly while the plant changes
    assert.ok((await m.seen([RECEPTACLE])).length, "minutes later it turns into a white seed head");
  })],

  ["a closed dandelion keeps a visible calyx between the yellow bloom and white seed head", async ctx => {
    for (const [colorScheme, calyx, tuft] of [
      ["dark", "#5c9a48", "#efeee6"], ["light", "#4d8a3b", "#d8d4c4"],
    ]) {
      await withMeadow(ctx, bed({ at: 0.5, kind: 5, planted: CLOCK_START - 16 * 60_000 }, {
        colorScheme, background: colorScheme === "dark" ? "#141414" : "#f7f8f3", reducedMotion: "reduce",
      }), async m => {
        const [base] = await m.seen([calyx]);
        const [tip] = await m.seen([tuft]);
        assert.ok(base && tip, "the green flower case and emerging pale tuft are both drawn");
        assert.ok(Math.abs(tip.x - base.x) < 4, "the tuft belongs to this flower");
      });
    }
  }],

  ["with reduced motion a touch quietly takes a few seeds, nothing flies", ctx => withMeadow(ctx, bed({ at: 0.5, kind: 5 }, { reducedMotion: "reduce" }), async m => {
    const [head] = await m.seen([RECEPTACLE]);
    const box = await m.box();
    await m.page.mouse.move(box.x + head.x - 6, box.y + head.y + 8);
    await m.run(200);
    assert.equal((await m.garden())[0].seeds, 21, "three seeds are gone");
    assert.deepEqual(await m.seen([ACHENE]), [], "and none fly");
    await m.page.mouse.move(box.x + head.x - 5, box.y + head.y + 8);
    await m.run(200);
    assert.equal((await m.garden())[0].seeds, 21, "holding the tilt takes no more");
  })],
];
