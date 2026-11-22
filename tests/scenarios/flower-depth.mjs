// In mature grass, some real blades cross the flowers; the flower bed remains visible.
import assert from "node:assert/strict";
import { CLOCK_START, COLORS, KEY, THREAD, turns, withMeadow } from "../harness/meadow.mjs";

const plants = [0, 1, 2, 3].map((kind, i) => ({ kind, at: 0.2 + i * 0.18 }));
const colors = COLORS.petals.map(petal => Number.parseInt(petal.slice(1), 16));

async function meadowPixels(ctx, minutes) {
  let result;
  await withMeadow(ctx, {
    size: "overgrown", rows: turns(50), random: 0.15, reducedMotion: "reduce",
    viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    storage: {
      [KEY.garden]: JSON.stringify(plants), [KEY.guests]: '{"bee":false,"butterfly":false}',
      [`bb-touch-grass:overgrown:${THREAD}`]: JSON.stringify({ v: 1, p: 40, s: CLOCK_START - minutes * 60_000, c: [] }),
    },
  }, async m => {
    result = await m.canvas.evaluate(canvas => {
      const height = Math.min(180, canvas.height);
      const { data } = canvas.getContext("2d").getImageData(0, canvas.height - height, canvas.width, height);
      return Array.from({ length: canvas.width * height }, (_, i) => {
        const index = i * 4;
        if (data[index + 3] < 254) return -1;
        return (data[index] << 16) | (data[index + 1] << 8) | data[index + 2];
      });
    });
    assert.deepEqual(await m.garden(), plants);
  });
  return result;
}

export default [
  ["some blades pass in front of the petals as grass grows, while other petals remain visible", async ctx => {
    const short = await meadowPixels(ctx, 0);
    const tall = await meadowPixels(ctx, 41);
    let crossed = 0, visible = 0;
    short.forEach((pixel, i) => {
      if (!colors.includes(pixel)) return;
      const r = tall[i] >> 16, g = (tall[i] >> 8) & 255, b = tall[i] & 255;
      if (tall[i] >= 0 && g > r && g > b) crossed++;
      if (tall[i] === pixel) visible++;
    });
    assert.ok(crossed > 6 && visible > crossed, `petal interiors crossed by green blades: ${crossed}, still visible: ${visible}`);
  }],
];
