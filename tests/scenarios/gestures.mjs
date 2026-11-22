// Measure the rendered lawn in CSS pixels while Chromium delivers touch input.
import assert from "node:assert/strict";
import { KEY, turns, withMeadow } from "../harness/meadow.mjs";

const phone = {
  rows: turns(52), viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true,
  storage: { [KEY.size]: "full", [KEY.guests]: JSON.stringify({ bee: false, butterfly: false }) },
};

async function finger(meadow) {
  const cdp = await meadow.context.newCDPSession(meadow.page);
  const box = await meadow.box();
  const send = (type, fraction, height) => cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{
      x: box.x + fraction * box.width, y: box.y + box.height - height, radiusX: 5, radiusY: 5,
    }],
  });
  return {
    down: (x, h) => send("touchStart", x, h),
    move: (x, h) => send("touchMove", x, h),
    up: () => send("touchEnd"),
  };
}

// Snapshot only the brushed part of the canvas. Flowers, controls and the firefly
// are outside this sample or drawn in a separate layer.
function sample(meadow) {
  return meadow.canvas.evaluate(el => {
    const w = el.width, h = el.height;
    const pixels = el.getContext("2d").getImageData(Math.floor(.41 * w), 0, Math.floor(.20 * w), h).data;
    return Array.from(pixels.filter((_, i) => i % 4 === 3));
  });
}

function changed(left, right) {
  return left.reduce((n, alpha, i) => n + (Math.abs(alpha - right[i]) > 25 ? 1 : 0), 0);
}

export default [
  ["a diagonal touch cut follows the blade height and a higher return pass leaves it alone", ctx =>
    withMeadow(ctx, phone, async m => {
      const touch = await finger(m);
      await m.root.locator(".tg-scythe").tap();
      const zones = [[.32, .37], [.60, .65]];
      const before = await m.grass(...zones);
      await touch.down(.24, 35);
      for (let i = 1; i <= 12; i++) await touch.move(.24 + .47 * i / 12, 35 - 30 * i / 12);
      await touch.up();
      await m.run(1100);
      const cut = await m.grass(...zones);
      assert.ok(cut[0] < before[0] - 3 && cut[1] < before[1] - 8, `visible cut: ${before} -> ${cut}`);
      assert.ok(cut[0] - cut[1] >= 10 && cut[0] > 20 && cut[1] < 18, `high and low sides: ${cut}`);
      await touch.down(.26, 52);
      await touch.move(.70, 52);
      await touch.up();
      await m.run(550);
      const after = await m.grass(...zones);
      assert.ok(after.every((v, i) => Math.abs(v - cut[i]) <= 2), `higher pass: ${cut} -> ${after}`);
      await touch.down(.29, 9);
      await touch.move(.41, 9);
      await touch.up();
      await m.run(1000);
      const [trimmedAgain] = await m.grass(zones[0]);
      assert.ok(trimmedAgain <= 13, `a lower pass can immediately trim an earlier cut: ${trimmedAgain}`);
      await m.page.clock.fastForward(65_000);
      await m.run(700);
      const regrown = await m.grass(...zones);
      assert.ok(regrown.every((v, i) => Math.abs(v - before[i]) <= 2), `regrowth: ${regrown}`);
    })],
  ["a young lawn can be lightly trimmed without taking every blade down to stubble", ctx =>
    withMeadow(ctx, { ...phone, rows: turns(5) }, async m => {
      const fingerInput = await finger(m);
      await m.root.locator(".tg-scythe").tap();
      const patch = [.30, .58];
      const [grown] = await m.grass(patch);
      const level = Math.round(grown * .62);
      await fingerInput.down(.24, level);
      await fingerInput.move(.66, level);
      await fingerInput.up();
      await m.run(1100);
      const [trimmed] = await m.grass(patch);
      assert.ok(grown > trimmed + 2 && Math.abs(trimmed - level) <= 2,
        `young grass trimmed at ${level}px: ${grown} -> ${trimmed}`);
    })],
  ["reduced motion holds a still bend under a resting finger and releases it immediately", ctx =>
    withMeadow(ctx, { ...phone, reducedMotion: "reduce" }, async m => {
      const touch = await finger(m);
      const zones = [[.44, .48], [.49, .52], [.53, .57]];
      const before = await m.grass(...zones);
      await touch.down(.5, 12);
      const bent = await m.grass(...zones);
      assert.ok(bent.some((h, i) => Math.abs(h - before[i]) >= 4), "touch alone bends the grass");
      await m.run(300);
      assert.deepEqual(await m.grass(...zones), bent, "a stationary finger causes no sway");
      await touch.up();
      const restored = await m.grass(...zones);
      assert.ok(restored.every((h, i) => Math.abs(h - before[i]) <= 3), `released immediately: ${before} -> ${restored}`);
    })],
  ["a bare finger produces a visible wave and the blades return after release", ctx =>
    withMeadow(ctx, { ...phone, random: 0.01 }, async m => {
      const touch = await finger(m);
      // Keep the sleeping firefly away from the stroke so the silhouette contains only grass.
      // The silhouette is stable across Chromium's GPU and readback renderers.
      const zones = Array.from({ length: 12 }, (_, i) => [.37 + .021*i, .39 + .021*i]);
      const resting = await m.grass(...zones);
      const before = await sample(m);
      await touch.down(.35, 12);
      for (let i = 1; i <= 9; i++) {
        await touch.move(.35 + .23 * i / 9, 12);
        await m.run(16);
      }
      const duringHeights = await m.grass(...zones);
      const during = await sample(m);
      await touch.up();
      await m.run(4500);
      const restored = await m.grass(...zones);
      const amplitude = changed(before, during);
      assert.ok(amplitude > before.length * .085, `a finger visibly displaces blades: ${amplitude} pixels`);
      const shifts = (heights) => heights.map((h,i) => Math.abs(h - resting[i]));
      const peak = Math.max(...shifts(duringHeights));
      assert.ok(peak >= 6, `visible silhouette shift during the swipe: ${resting} -> ${duringHeights}`);
      const recovery = shifts(restored);
      assert.ok(recovery.filter(h => h > 2).length <= 1 && Math.max(...recovery) <= 4,
        `release restores the silhouette: ${resting} -> ${restored}`);
    })],
];
