// A young plant already has folded leaves at the end of its stem, above a mown strip.
import assert from "node:assert/strict";
import { CLOCK_START, KEY, THREAD, turns, withMeadow } from "../harness/meadow.mjs";

export default [
  ["the tip of a fresh sprout has a visible crown in both themes", async ctx => {
    for (const colorScheme of ["light", "dark"]) {
      await withMeadow(ctx, {
        viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        size: "overgrown", reducedMotion: "reduce", colorScheme, rows: turns(50),
        storage: {
          [KEY.garden]: JSON.stringify([{ kind: 0, at: 0.5, planted: CLOCK_START }]),
          [KEY.guests]: '{"bee":false,"butterfly":false}',
          [`bb-touch-grass:overgrown:${THREAD}`]: JSON.stringify({
            v: 1, p: 40, s: CLOCK_START - 41 * 60_000,
            c: Array.from({ length: 21 }, (_, i) => [20 + i, 41 * 60]),
          }),
        },
      }, async m => {
        const tip = await m.root.locator(".tg-flower-stems").evaluate(path => {
          const root = path.getPointAtLength(0);
          const end = path.getPointAtLength(path.getTotalLength());
          return { x: end.x, height: root.y - end.y };
        });
        const colored = await m.canvas.evaluate((el, tip) => {
          const scale = el.width / el.clientWidth;
          // Only the area above the stem end counts. A one-pixel line cap cannot pass.
          const w = Math.round(14 * scale), h = Math.round(9 * scale);
          const x = Math.round(tip.x * scale - w / 2);
          const y = Math.round(el.height - (tip.height + 1) * scale - h);
          const data = el.getContext("2d").getImageData(x, y, w, h).data;
          let count = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 100) count++;
          return count / (scale * scale);
        }, tip);
        assert.ok(colored > 2, `a visible tip sits above the stem in ${colorScheme}: ${colored} CSS pixels`);
      });
    }
  }],
];
