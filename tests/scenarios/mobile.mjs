// Phone: touch targets, tapping the buttons, mowing with a finger, scrolling stays free.
import assert from "node:assert/strict";
import { awaitFirefly, COLORS, KEY, NO_BLOOM, turns, withMeadow } from "../harness/meadow.mjs";

const phone = {
  viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  rows: turns(50), storage: { [KEY.size]: "full" },
};

async function swipe(m, from, to, y) {
  const cdp = await m.context.newCDPSession(m.page);
  const box = await m.box();
  const point = f => [{ x: box.x + box.width * f, y: box.y + box.height * y }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from) });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(from + ((to - from) * i) / 12) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export default [
  ["petting and scything leave BB's side panels closed", ctx => withMeadow(ctx, phone, async m => {
    // Model BB's two horizontal navigation gestures on the parent of the banner.
    await m.bb(() => {
      let start;
      window.openPanel = null;
      document.addEventListener("touchstart", event => {
        start = { x: event.touches[0].clientX, target: event.target };
      }, { capture: true, passive: true });
      document.addEventListener("touchmove", event => {
        if (!start) return;
        const dx = event.touches[0].clientX - start.x;
        if (Math.abs(dx) < 28) return;
        const panel = dx > 0 ? "sidebar" : "secondary-panel";
        if (!start.target.closest(`[data-no-${panel}-swipe]`)) window.openPanel = panel;
      }, { capture: true, passive: true });
    });
    await swipe(m, .28, .65, .78);
    await m.scytheButton.tap();
    await swipe(m, .65, .28, .78);
    assert.equal(await m.bb(() => window.openPanel), null);
  })],
  ["a sleeping firefly can be brushed between the phone controls", ctx => withMeadow(ctx, {
    ...phone, scope: { kind: "project" }, waitFor: "none",
    storage: { ...phone.storage, ...NO_BLOOM(), [KEY.garden]: JSON.stringify([.42, .43, .44].map(at => ({ at, kind: 1 }))) },
  }, async m => {
    await m.bb(() => { Math.random = () => .99; window.bb.setScope({ kind: "thread", threadId: "thr_meadow" }); });
    await m.ready(2000);
    await awaitFirefly(m);
    const glow = await m.root.locator(".tg-firefly.is-on .tg-firefly-glow").boundingBox();
    assert.ok(glow);
    const x = glow.x + glow.width / 2;
    const scythe = await m.scytheButton.boundingBox();
    const mower = await m.mowButton.boundingBox();
    assert.ok(x > scythe.x + scythe.width && x < mower.x, `the glow is reachable at x=${x}`);
  })],
  ["meadow buttons are visible, separate touch targets of at least 44×44", ctx => withMeadow(ctx, phone, async m => {
    const controls = [m.scytheButton, m.mowButton, m.toggle];
    const boxes = [];
    for (const control of controls) {
      const name = await control.getAttribute("aria-label");
      const box = await control.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `${name}: ${box.width}×${box.height}`);
      assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 760, `${name} on screen`);
      const shown = await control.evaluate(el => {
        const opacity = [];
        for (let e = el; e; e = e.parentElement) opacity.push(Number(getComputedStyle(e).opacity));
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { visible: el.checkVisibility({ visibilityProperty: true }), opacity: opacity.reduce((a, b) => a * b, 1), hit: el.contains(hit) };
      });
      assert.ok(shown.visible && shown.opacity >= 0.6, `${name} visible without hover: ${JSON.stringify(shown)}`);
      assert.ok(shown.hit, `${name} is not covered by anything`);
      boxes.push([name, box]);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(boxes[i][1], boxes[j][1]), `${boxes[i][0]} / ${boxes[j][0]} overlap`);
    }
  })],

  ["tapping the mower mows; a finger swipe brushes but cuts only with the scythe", ctx => withMeadow(ctx, phone, async m => {
    assert.equal(await m.canvas.evaluate(el => el.width / el.clientWidth), 2, "sharp on a 2× screen");
    const before = await m.grass([0.3, 0.6]);
    await swipe(m, 0.25, 0.65, 0.8);
    await m.run(4000);
    assert.deepEqual(await m.grass([0.3, 0.6]), before, "a plain swipe does not cut");
    await m.scytheButton.tap();
    assert.equal(await m.scytheButton.getAttribute("aria-pressed"), "true");
    await swipe(m, 0.25, 0.65, 0.8);
    await m.run(500);
    const cut = await m.grass([0.3, 0.6]);
    assert.ok(cut[0] < before[0] / 2, `the scythe cuts along the finger: ${before} -> ${cut}`);
    await m.scytheButton.tap();
    await m.forget();
    await m.mowButton.tap();
    await m.run(600);
    assert.equal((await m.seen([COLORS.mower])).length, 1, "the mower starts");
    await m.toggle.tap();
    assert.equal(await m.toggle.getAttribute("aria-expanded"), "true");
    await m.toggle.tap();
    assert.equal(await m.toggle.getAttribute("aria-expanded"), "false");
  })],
];
