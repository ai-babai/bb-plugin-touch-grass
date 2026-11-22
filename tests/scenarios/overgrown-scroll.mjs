// Phone, Overgrown: a vertical finger swipe over standing grass scrolls the chat behind it.
// BB keeps the composer in a sticky dock inside the scrolling thread pane; model that here.
// Petting and the scythe are covered by the gestures and overgrown scenarios.
import assert from "node:assert/strict";
import { KEY, turns, withMeadow } from "../harness/meadow.mjs";
import { ageMeadow, chooseOvergrown } from "../harness/overgrown.mjs";

const phone = {
  rows: turns(0), viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  storage: { [KEY.guests]: '{"bee":false,"butterfly":false}' },
};

/** Thread pane that scrolls, with the banner and composer in a sticky dock at its bottom. */
function dockInScroller() {
  const chat = document.querySelector(".chat");
  chat.classList.add("thread-scrollbar");
  Object.assign(chat.style, { display: "block", height: "100vh", overflowY: "auto" });
  document.querySelector(".messages").style.height = "2400px";
  const dock = document.createElement("div");
  dock.className = "sticky";
  Object.assign(dock.style, { position: "sticky", bottom: "0" });
  chat.append(dock);
  dock.append(document.getElementById("banner"), document.querySelector(".composer"));
}

const scrollTop = m => m.bb(() => document.querySelector(".chat").scrollTop);

/** Waits on the real clock until the pane stops moving (a fling runs on the compositor). */
async function settle(m) {
  let last = await scrollTop(m);
  for (let i = 0; i < 40; i++) {
    await m.page.waitForTimeout(80);
    const now = await scrollTop(m);
    if (now === last) return now;
    last = now;
  }
  return last;
}

/** A point on standing grass above the strip, found by the browser's own hit-test. */
function grassPoint(m) {
  return m.bb(() => {
    const strip = document.querySelector(".tg-meadow").getBoundingClientRect();
    for (let y = strip.top - 150; y < strip.top - 30; y += 6) {
      for (let x = strip.left + strip.width * .3; x < strip.left + strip.width * .7; x += 6) {
        if (document.elementFromPoint(x, y)?.closest(".tg-hit")) return { x, y };
      }
    }
    return null;
  });
}

async function swipe(m, at, dy) {
  assert.ok(at, "the gesture has a visible starting point");
  const cdp = await m.context.newCDPSession(m.page);
  const send = (type, y) => cdp.send("Input.dispatchTouchEvent", {
    type, touchPoints: type === "touchEnd" ? [] : [{ x: at.x, y, radiusX: 6, radiusY: 6 }],
  });
  await send("touchStart", at.y);
  for (let i = 1; i <= 12; i++) await send("touchMove", at.y + dy * i / 12);
  await send("touchEnd");
  await cdp.detach();
}

export default [
  ["a vertical finger swipe over standing grass scrolls the chat both ways", ctx =>
    withMeadow(ctx, phone, async m => {
      await m.bb(dockInScroller);
      await chooseOvergrown(m);
      await ageMeadow(m, 41);
      // The card flip is a CSS transition on the real clock: wait until the canopy stands above the strip.
      await m.page.waitForFunction(() => {
        const strip = document.querySelector(".tg-meadow").getBoundingClientRect();
        return document.querySelector(".tg-canvas").getBoundingClientRect().top < strip.top - 150;
      });
      await m.bb(() => { document.querySelector(".chat").scrollTop = 1200; });

      const start = await settle(m);
      await swipe(m, await grassPoint(m), 110); // finger down: back through the history
      await m.page.waitForFunction(y => document.querySelector(".chat").scrollTop < y - 50, start);
      const up = await settle(m);

      await swipe(m, await grassPoint(m), -110); // finger up: toward the newest message
      await m.page.waitForFunction(y => document.querySelector(".chat").scrollTop > y + 50, up);
      const down = await settle(m);
      assert.ok(up < start - 50 && down > up + 50, `scrollTop ${start} -> ${up} -> ${down}`);
    })],
  ["a vertical swipe starting on the firefly scrolls without planting a flower", ctx =>
    withMeadow(ctx, { ...phone, size: "overgrown" }, async m => {
      await m.bb(dockInScroller);
      await m.bb(() => { document.querySelector(".chat").scrollTop = 1200; });
      const start = await settle(m);
      const target = await m.root.locator(".tg-firefly-target:visible").boundingBox();
      await swipe(m, { x: target.x + target.width / 2, y: target.y + target.height / 2 }, -100);
      await m.page.waitForFunction(y => document.querySelector(".chat").scrollTop > y + 50, start);
      assert.deepEqual(await m.garden(), []);
    })],
  ["a vertical swipe on the timer thumb scrolls the chat and preserves the period", ctx =>
    withMeadow(ctx, { ...phone, size: "overgrown" }, async m => {
      await m.bb(dockInScroller);
      await m.toggle.tap();
      const slider = m.root.getByRole("slider");
      const track = await slider.boundingBox();
      const minutes = await slider.inputValue();
      await m.bb(() => { document.querySelector(".chat").scrollTop = 1200; });
      const start = await settle(m);
      await swipe(m, { x: track.x + track.width / 2, y: track.y + track.height / 2 }, 100);
      await m.page.waitForFunction(y => document.querySelector(".chat").scrollTop < y - 50, start);
      assert.equal(await slider.inputValue(), minutes);
    })],
];
