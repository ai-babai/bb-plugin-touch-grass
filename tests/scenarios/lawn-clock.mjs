import assert from "node:assert/strict";
import { KEY, turns, THREAD, withMeadow } from "../harness/meadow.mjs";
import { ageMeadow, chooseOvergrown } from "../harness/overgrown.mjs";

const opts = { reducedMotion: "reduce", rows: turns(50), storage: { [KEY.guests]: '{"bee":false,"butterfly":false}' } };
const periodKey = "bb-touch-grass:regrow-minutes";
const minutes = m => m.root.locator("output.tg-timer-value").innerText();
const countdown = m => m.root.getByRole("timer").innerText();

export default [
  ["forty real minutes grow a new meadow even without messages, and mowing resets its clock", ctx =>
    withMeadow(ctx, opts, async m => {
      await chooseOvergrown(m);
      const [fresh] = await m.grass();
      await m.bb(id => window.bb.append(id, [{ type: "turn/started", data: {} }]), THREAD);
      await m.run(1500);
      assert.ok((await m.grass())[0] < 35, "conversation history alone does not grow an overgrown plot");
      await m.toggle.click();
      assert.equal(await minutes(m), "40 мин");
      assert.match(await countdown(m), /39:|40:00/);
      await m.toggle.click();
      await ageMeadow(m, 20);
      const [half] = await m.grass();
      await m.reload();
      const [reopened] = await m.grass();
      assert.ok(Math.abs(half - reopened) < 9, "the same thread keeps its growth when reopened");
      await ageMeadow(m, 21);
      const [grown] = await m.grass();
      assert.ok(grown > 130 && (half - fresh) / (grown - fresh) > .33 && (half - fresh) / (grown - fresh) < .68,
        `first use, 20 minutes, 41 minutes: ${fresh}, ${half}, ${grown}`);
      await m.toggle.click();
      assert.equal(await countdown(m), "Луг вырос");
      await m.toggle.click();
      await m.mowButton.click();
      await m.run(220);
      await m.toggle.click();
      assert.match(await countdown(m), /39:|40:00/);
    })],
  ["the selected duration survives reopening, and a scythed patch keeps its own time", ctx =>
    withMeadow(ctx, { ...opts, storage: { ...opts.storage, [periodKey]: "20" } }, async m => {
      await chooseOvergrown(m);
      await ageMeadow(m, 21);
      const box = await m.box();
      await m.scytheButton.click();
      const low = box.y + box.height - 32;
      await m.page.mouse.move(box.x + box.width * .22, low);
      await m.page.mouse.down();
      await m.page.mouse.move(box.x + box.width * .56, low, { steps: 16 });
      await m.page.mouse.up();
      await m.reload();
      const areas = [[.29, .48], [.70, .88]];
      const [cut, intact] = await m.grass(...areas);
      assert.ok(cut < intact * .4, `reopened path and standing grass: ${cut}, ${intact}`);
      await m.toggle.click();
      assert.equal(await minutes(m), "20 мин");
      assert.match(await countdown(m), /\d+:\d\d/);
      await m.toggle.click();
      await ageMeadow(m, 10);
      const [recovering, other] = await m.grass(...areas);
      assert.ok(recovering > cut + 20 && recovering < other * .88 && Math.abs(other - intact) < 6);
      await ageMeadow(m, 11);
      assert.ok((await m.grass(areas[0]))[0] > intact * .85);
    })],
  ["a damaged cut entry still opens the saved mature meadow", ctx =>
    withMeadow(ctx, { ...opts, storage: {
      [KEY.size]: "overgrown",
      [`bb-touch-grass:overgrown:${THREAD}`]: JSON.stringify({ v: 1, p: 40, s: 1, c: [null, [2], "bad"] }),
    } }, async m => {
      assert.ok((await m.grass())[0] > 140);
      await m.toggle.click();
      assert.equal(await countdown(m), "Луг вырос");
    })],
  ["on a narrow phone the growth slider accepts a drag and keeps Back in place", ctx =>
    withMeadow(ctx, { ...opts, lang: "en", hasTouch: true, isMobile: true, colorScheme: "dark",
      viewport: { width: 320, height: 640 } }, async m => {
      await chooseOvergrown(m);
      await ageMeadow(m, 10);
      const front = await m.toggle.boundingBox();
      await m.toggle.tap();
      const slider = m.root.getByRole("slider");
      assert.ok(await slider.getAttribute("aria-label") || await slider.evaluate(el => el.labels.length || el.getAttribute("aria-labelledby")));
      const track = await slider.boundingBox();
      assert.ok(track.height >= 44 && track.x >= 0 && track.x + track.width <= 320);
      const back = await m.toggle.boundingBox();
      assert.ok(Math.abs(back.x - front.x) < 1 && Math.abs(back.y - front.y) < 1);
      const y = track.y + track.height / 2;
      const input = await m.context.newCDPSession(m.page);
      // Move the thumb from the 40-minute mark towards 15. Aim three minutes below 40.
      const marks = await m.root.locator(".tg-timer-scale span").evaluateAll(labels => labels.map(el => {
        const box = el.getBoundingClientRect();
        return { minutes: Number(el.textContent), x: box.x + box.width / 2 };
      }));
      assert.deepEqual(marks.map(mark => mark.minutes), [5, 15, 40, 90]);
      const span = marks[2].x - marks[1].x;
      assert.ok(Math.abs(span - (marks[1].x - marks[0].x)) < 1);
      assert.ok(Math.abs(span - (marks[3].x - marks[2].x)) < 1);
      for (const [index, value] of [40, 30, 25, 33, 37].entries()) {
        await input.send("Input.dispatchTouchEvent", { type: index ? "touchMove" : "touchStart",
          touchPoints: [{ x: marks[2].x - (40 - value) / 25 * span, y }] });
      }
      await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await m.run(1100);
      assert.equal(await minutes(m), "37 min");
      assert.match(await countdown(m), /27:4[0-5]/);
      await m.reload();
      await m.toggle.tap();
      assert.equal(await minutes(m), "37 min");
      assert.match(await countdown(m), /27:[34]\d/);
      await slider.press("ArrowLeft");
      assert.equal(await minutes(m), "36 min");
      await slider.press("Home");
      for (let value = 5; value <= 90; value++) {
        assert.equal(await slider.getAttribute("aria-valuetext"), value + " min");
        if (value < 90) await slider.press("ArrowRight");
      }
      await slider.press("PageDown");
      assert.equal(await minutes(m), "85 min");
      await slider.press("End");
      assert.equal(await minutes(m), "90 min");
      await slider.press("Escape");
      assert.equal(await slider.count(), 0);
    })],
  ["Grow now fills this chat immediately and the next mowing restarts the selected period", async ctx => {
    for (const motion of ["reduce", "no-preference"]) await withMeadow(ctx, { ...opts, reducedMotion: motion,
      viewport: { width: 320, height: 730 }, hasTouch: true, isMobile: true,
      threads: { [THREAD]: turns(0), thr_other: turns(0) } }, async m => {
      await chooseOvergrown(m);
      await m.toggle.click();
      await m.root.getByRole("slider").press("Home");
      const boost = m.root.getByRole("button", { name: "Вырастить сейчас" });
      const panel = await m.root.boundingBox();
      const action = await boost.boundingBox();
      assert.ok(action.height >= 44 && action.x >= panel.x && action.x + action.width <= panel.x + panel.width + 1);
      await boost.tap();
      assert.equal(await m.toggle.getAttribute("aria-expanded"), "false");
      await m.run(motion === "reduce" ? 32 : 170);
      const [early] = await m.grass();
      await m.run(1100);
      const [grown] = await m.grass();
      if (motion === "reduce") assert.ok(Math.abs(early - grown) < 4, "reduced motion shows the mature grass immediately");
      else assert.ok(early < grown - 15, `visible burst of growth: ${early} to ${grown}`);
      assert.ok(grown > 140, `boost fills new plot: ${grown}`);
      await m.reload();
      assert.ok((await m.grass())[0] > 140, "growth survives reopening");
      await m.bb(() => window.bb.setScope({ kind: "thread", threadId: "thr_other" }));
      await m.run(1800);
      assert.ok((await m.grass())[0] < grown / 3, "new chat has its own clock");
      await m.bb(id => window.bb.setScope({ kind: "thread", threadId: id }), THREAD);
      await m.run(1800);
      await m.toggle.click();
      assert.equal(await countdown(m), "Луг вырос");
      await m.toggle.click();
      await m.mowButton.click();
      await m.run(motion === "reduce" ? 200 : 5000);
      assert.ok((await m.grass())[0] < grown / 3);
      await m.toggle.click();
      assert.match(await countdown(m), /4:|5:00/);
    });
  }],
];
