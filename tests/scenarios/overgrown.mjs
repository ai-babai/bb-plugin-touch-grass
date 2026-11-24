import assert from "node:assert/strict";
import { KEY, turns, withMeadow } from "../harness/meadow.mjs";

import { ageMeadow, chooseOvergrown } from "../harness/overgrown.mjs";

const stripHeight = m => m.root.evaluate(el => el.getBoundingClientRect().height);
const options = { reducedMotion: "reduce", storage: { [KEY.guests]: '{"bee":false,"butterfly":false}' } };

export default [
  ["standing grass takes the tap; only a local cut exposes the link behind it", async ctx => {
    for (const touch of [false, true]) await withMeadow(ctx, {
      ...options, rows: turns(0), isMobile: touch, hasTouch: touch,
      viewport: { width: touch ? 390 : 900, height: 760 },
    }, async m => {
      await chooseOvergrown(m);
      await ageMeadow(m, 41);
      const canopy = await m.box();
      assert.ok(canopy.height > 185 && canopy.height < 290, `mature canopy in a 760px chat: ${canopy.height}`);
      assert.ok(await stripHeight(m) <= 48, "only the compact strip takes up space");
      const middle = canopy.x + canopy.width * .44;
      const neighbour = canopy.x + canopy.width * .74;
      const pressY = canopy.y + canopy.height - 122;
      await m.bb(({ middle, neighbour, y }) => {
        window.opened = [];
        for (const [i, x] of [middle, neighbour].entries()) {
          const a = document.createElement("a");
          a.textContent = "Notes " + i;
          a.href = "#note-" + i;
          a.onclick = event => { event.preventDefault(); window.opened.push(i); };
          Object.assign(a.style, { position: "absolute", top: y - 12 + "px", left: x - 20 + "px", width: "40px", height: "24px" });
          document.querySelector(".messages").append(a);
        }
      }, { middle, neighbour, y: pressY });
      const tap = x => touch ? m.page.touchscreen.tap(x, pressY) : m.page.mouse.click(x, pressY);
      const opened = () => m.bb(() => window.opened);
      await tap(middle);
      assert.deepEqual(await opened(), [], "standing grass shields the message link");
      await m.scytheButton.click();
      const y = canopy.y + canopy.height - 80;
      await m.page.mouse.move(canopy.x + canopy.width * .20, y);
      await m.page.mouse.down();
      await m.page.mouse.move(canopy.x + canopy.width * .62, y, { steps: 20 });
      await m.page.mouse.up();
      await m.run(350);
      const [cut] = await m.grass([.35, .52]);
      assert.ok(Math.abs(cut - 80) < 6, `cut at 80px above the roots: ${cut}`);
      await m.scytheButton.click();
      await tap(middle);
      await tap(neighbour);
      assert.deepEqual(await opened(), [0], "the path exposes its link and neighbouring grass still receives taps");
      await m.mowButton.click();
      await m.run(250);
      await tap(neighbour);
      assert.deepEqual(await opened(), [0, 1], "the mower opens the rest of the lawn");
      await ageMeadow(m, 41);
      await tap(neighbour);
      assert.deepEqual(await opened(), [0, 1], "regrown blades receive the tap again");
    });
  }],
  ["resizing the chat pane changes the canopy without regrowing the cut patch", ctx =>
    withMeadow(ctx, { ...options, rows: turns(50) }, async m => {
      await m.bb(() => {
        const pane = document.querySelector(".chat");
        pane.classList.add("thread-scrollbar");
        Object.assign(pane.style, { height: "650px", marginTop: "45px", overflowY: "auto" });
      });
      await chooseOvergrown(m);
      await ageMeadow(m, 41);
      const box = await m.box();
      const h = await m.height();
      assert.ok(Math.abs(h - 650 / 3) < 18, `height relative to the pane: ${h}`);
      await m.scytheButton.click();
      const y = box.y + box.height - 55;
      await m.page.mouse.move(box.x + box.width * .21, y);
      await m.page.mouse.down();
      await m.page.mouse.move(box.x + box.width * .57, y, { steps: 15 });
      await m.page.mouse.up();
      await m.bb(() => { document.querySelector(".chat").style.height = "460px"; });
      await m.page.waitForFunction(oldHeight => document.querySelector(".tg-canvas").getBoundingClientRect().height < oldHeight - 35, h);
      const resized = await m.height();
      assert.ok(Math.abs(resized - 460 / 3) < 16);
      const [cut, uncut] = await m.grass([.28, .50], [.69, .88]);
      assert.ok(cut < uncut * .58, `cut still visible after layout: ${cut} vs ${uncut}`);
    })],
  ["the canopy adapts to a shorter mobile viewport while its controls stay at the roots", ctx =>
    withMeadow(ctx, { ...options, rows: turns(50), viewport: { width: 320, height: 800 }, hasTouch: true, isMobile: true },
      async m => {
        await m.toggle.tap();
        const choices = m.root.getByRole("button").filter({ visible: true });
        const panel = await m.root.boundingBox();
        const boxes = await Promise.all((await choices.all()).map(button => button.boundingBox()));
        for (const box of boxes) {
          assert.ok(box.width >= 44 && box.height >= 44);
          assert.ok(box.x >= panel.x && box.x + box.width <= panel.x + panel.width + 1);
        }
        for (const [index, a] of boxes.entries()) {
          for (const b of boxes.slice(index + 1)) {
            const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
            const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
            assert.ok(overlapX <= 1 || overlapY <= 1, "settings controls have separate touch targets");
          }
        }
        await m.page.getByRole("button", { name: /заросли/i }).tap();
        await m.toggle.tap();
        await ageMeadow(m, 41);
        const initial = await m.height();
        await m.page.setViewportSize({ width: 320, height: 470 });
        await m.page.waitForFunction(previous => document.querySelector(".tg-canvas").clientHeight < previous - 35, initial);
        const shorter = await m.height();
        assert.ok(shorter > 105 && shorter < initial * .75, `canopy follows viewport: ${initial} -> ${shorter}`);
        assert.ok(await stripHeight(m) <= 48);
      })],
];
