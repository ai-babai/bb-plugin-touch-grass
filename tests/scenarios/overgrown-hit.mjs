// Overgrown hit layer: empty chat between the blades stays clickable, the grass itself takes taps.
import assert from "node:assert/strict";
import { KEY, turns, withMeadow } from "../harness/meadow.mjs";

import { ageMeadow } from "../harness/overgrown.mjs";

const MARGIN = 6; // px of empty canvas required on each side of a probed cell

/** Centres of 10×10 cells with no paint in them, around them, or above them (page px). */
function emptyCells(meadow) {
  return meadow.canvas.evaluate((el, margin) => {
    const box = el.getBoundingClientRect();
    const dpr = el.width / box.width;
    const rgba = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
    const width = Math.floor(box.width), height = Math.floor(box.height);
    const top = Array.from({ length: width }, (_, x) => {
      for (let y = 0; y < el.height; y++) {
        for (let dx = 0; dx < dpr; dx++) if (rgba[(y * el.width + Math.floor(x * dpr) + dx) * 4 + 3] > 4) return y / dpr;
      }
      return height;
    });
    const cells = [], grass = [];
    for (let x = margin; x + 10 + margin <= width; x += 10) {
      const roof = Math.min(...top.slice(x - margin, x + 10 + margin));
      for (let y = 0; y + 10 <= roof; y += 10) cells.push([box.left + x + 5, box.top + y + 5]);
      const low = Math.round(height * 0.85); // dense grass near the roots
      if (rgba[(Math.round(low * dpr) * el.width + Math.round((x + 5) * dpr)) * 4 + 3] > 200) grass.push([box.left + x + 5, box.top + low]);
    }
    return { cells, grass };
  }, MARGIN);
}

async function clickThrough(meadow, points) {
  const reached = [];
  for (const [x, y] of points) {
    const before = await meadow.bb(() => window.chatClicks);
    await meadow.page.mouse.click(x, y);
    reached.push((await meadow.bb(() => window.chatClicks)) > before);
  }
  return reached;
}

export default [
  ["empty chat above and between Overgrown blades takes clicks, the blades themselves do not let them through", async ctx => {
    for (const viewport of [{ width: 390, height: 760 }, { width: 1100, height: 760 }]) await withMeadow(ctx, {
      size: "overgrown", rows: turns(10), reducedMotion: "reduce", viewport,
      storage: { [KEY.guests]: '{"bee":false,"butterfly":false}' },
    }, async m => {
      await ageMeadow(m, 60);
      await m.bb(() => {
        const chat = document.createElement("div");
        Object.assign(chat.style, { position: "fixed", inset: "0", zIndex: "0" });
        window.chatClicks = 0;
        chat.addEventListener("click", () => window.chatClicks++);
        document.body.prepend(chat);
      });
      const { cells, grass } = await emptyCells(m);
      assert.ok(cells.length > 40 && grass.length > 10, `probe sizes: ${cells.length} empty, ${grass.length} grass`);
      const empty = await clickThrough(m, cells);
      const swallowed = cells.filter((_, i) => !empty[i]).map(p => p.map(Math.round));
      assert.deepEqual(swallowed, [], `${viewport.width}px: empty cells kept by the meadow`);
      const standing = await clickThrough(m, grass.filter((_, i) => i % 3 === 0));
      assert.ok(standing.every(through => !through), "standing grass still takes the tap");
    });
  }],
];
