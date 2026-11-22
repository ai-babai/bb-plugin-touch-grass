// The meadow grows with wall time (one lawn clock per thread) and follows live thread updates;
// the number of turns never changes its height.
import assert from "node:assert/strict";
import { THREAD, turns, withMeadow } from "../harness/meadow.mjs";

const turnLists = m => m.calls("threads.events.list").then(cs => cs.filter(c => c.side === "front" && c.input.types.includes("turn/started")));

export default [
  ["plugin registers a bare thread banner above the composer", ctx => withMeadow(ctx, {}, async m => {
    const { customizations, rpc } = await m.bb(() => window.bb.registered);
    assert.deepEqual(customizations.map(c => [c.scopes, c.banners.map(b => [b.id, b.chrome])]), [[["thread"], [["grass", "bare"]]]]);
    assert.deepEqual(rpc, ["meadow_activity"]);
    assert.equal(await m.root.getAttribute("aria-label"), "Луг этого чата");
    const [meadow, composer] = await Promise.all([m.box(), m.page.locator(".composer").boundingBox()]);
    assert.ok(meadow.width > 1000 && composer.y >= meadow.y + meadow.height - 1, "meadow sits right above the composer");
  })],

  ["an older lawn clock grows a taller and denser meadow than a fresh one, regardless of turns", async ctx => {
    const sample = async (age, n = 50) => {
      let result;
      await withMeadow(ctx, { rows: turns(n), age, size: "full" }, async m => { result = { grass: (await m.grass())[0], cover: await m.cover() }; });
      return result;
    };
    const fresh = await sample(0), young = await sample(12), mature = await sample(41), beyond = await sample(600);
    assert.ok(fresh.cover > 0 && fresh.grass < young.grass, `stubble first, then growth: ${fresh.grass} -> ${young.grass}`);
    assert.ok(mature.grass > young.grass + 10, `a mature lawn is taller: ${young.grass} -> ${mature.grass}`);
    assert.deepEqual(beyond, mature, "growth saturates at maturity");
  }],

  ["new turns and steering neither grow nor remount the meadow", ctx => withMeadow(ctx, { rows: turns(2), age: 12 }, async m => {
    await m.canvas.evaluate(el => { el.dataset.original = "yes"; });
    const before = await m.grass();
    await m.bb(id => window.bb.append(id, Array.from({ length: 20 }, () => ({ type: "turn/input/accepted", data: {} }))), THREAD);
    await m.run(1600);
    const steered = await m.grass();
    assert.ok(Math.abs(steered[0] - before[0]) <= 2, `steering does not change the height: ${before} -> ${steered}`);
    // Irrelevant activity does not re-read the history.
    const lists = (await turnLists(m)).length;
    await m.bb(id => window.bb.changed({ threadId: id, changes: ["events-appended"], metadata: { eventTypes: ["item/started"] } }), THREAD);
    await m.run(300);
    assert.equal((await turnLists(m)).length, lists);
    // History rewrite, status change without metadata and reconnect all refresh it.
    await m.bb(id => window.bb.replace(id, []), THREAD);
    await m.run(1600);
    assert.ok(Math.abs((await m.grass())[0] - steered[0]) <= 2, "a rewritten history leaves the lawn as it is");
    await m.bb(id => window.bb.changed({ threadId: id, changes: ["status-changed"] }), THREAD);
    await m.bb(() => window.bb.reconnected());
    await m.run(300);
    assert.equal((await turnLists(m)).length, lists + 3);
    assert.equal(await m.canvas.evaluate(el => el.dataset.original), "yes", "same canvas element");
  })],

  ["switching threads remounts the meadow and releases subscriptions", ctx => withMeadow(ctx, {
    threads: { [THREAD]: turns(50), thr_other: turns(50) }, ages: { [THREAD]: 5, thr_other: 600 },
  }, async m => {
    const [small] = await m.grass();
    const subscriptions = await m.bb(() => window.bb.listeners());
    await m.bb(() => window.bb.setScope({ kind: "thread", threadId: "thr_other" }));
    await m.run(2000);
    assert.ok((await m.grass())[0] > small + 5, "the other thread has its own, older and taller lawn");
    assert.deepEqual((await m.bb(() => window.bb.listeners())).sort(), subscriptions.map(l => l.replace(THREAD, "thr_other")).sort());
    await m.bb(() => window.bb.setScope({ kind: "project" }));
    await m.run(100);
    assert.equal(await m.root.count(), 0, "no meadow outside threads");
    assert.deepEqual(await m.bb(() => window.bb.listeners()), []);
  })],

  ["unavailable history leaves the chat without a meadow and only warns", ctx => withMeadow(ctx, { scope: { kind: "project" }, waitFor: "none" }, async m => {
    await m.bb(() => { window.bb.failures.list = 1; window.bb.setScope({ kind: "thread", threadId: "thr_meadow" }); });
    await m.run(1000);
    assert.ok(m.console.some(line => line.startsWith("warning") && line.includes("История ходов недоступна")), m.console.join("\n"));
  })],

  ["meadow follows the chat width and the BB colour theme", ctx => withMeadow(ctx, { rows: turns(30) }, async m => {
    const light = await m.pixels();
    await m.page.setViewportSize({ width: 640, height: 760 });
    await m.page.waitForTimeout(100);
    await m.run(300);
    const narrow = await m.box();
    assert.ok(Math.abs(narrow.width - (640 - 32)) <= 1, `canvas follows the column: ${narrow.width}`);
    await m.page.setViewportSize({ width: 1100, height: 760 });
    await m.page.waitForTimeout(100);
    await m.run(300);
    assert.equal(await m.pixels(), light, "same thread, same meadow drawing");
    await m.bb(() => document.documentElement.style.setProperty("--background", "#101410"));
    await m.run(100);
    const dark = await m.pixels();
    assert.notEqual(dark, light, "dark theme repaints the grass");
    // Without a --background token the theme falls back to the root class.
    await m.bb(() => { document.documentElement.style.removeProperty("--background"); document.documentElement.className = "dark"; });
    await m.run(100);
    assert.equal(await m.pixels(), dark);
    await m.bb(() => { document.documentElement.className = ""; document.documentElement.dataset.theme = "light"; });
    await m.run(100);
    assert.equal(await m.pixels(), light);
  })],

  ["system dark scheme without host tokens gives the dark meadow", async ctx => {
    const shots = [];
    for (const colorScheme of ["light", "dark"]) {
      await withMeadow(ctx, { colorScheme, background: null, rows: turns(30) }, async m => { shots.push(await m.greenness()); });
    }
    assert.notEqual(shots[0], shots[1]);
  }],
];
