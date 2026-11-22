// Drawing flowers over grass must preserve the opacity of the grass behind them.
import assert from "node:assert/strict";
import { KEY, turns, withMeadow } from "../harness/meadow.mjs";

const garden = [0, 1, 2, 3].map((kind, i) => ({ kind, at: 0.2 + 0.18 * i }));

async function alpha(ctx, colorScheme, plants) {
  let result;
  await withMeadow(ctx, {
    colorScheme, background: colorScheme === "dark" ? "#20251f" : "#f7f8f3",
    viewport: { width: 390, height: 780 }, reducedMotion: "reduce", random: 0.15,
    rows: turns(50), size: "full",
    storage: { [KEY.garden]: JSON.stringify(plants), [KEY.guests]: '{"bee":false,"butterfly":false}' },
  }, async m => {
    result = await m.canvas.evaluate(canvas => {
      const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      return Array.from(data.filter((_, index) => index % 4 === 3));
    });
  });
  return result;
}

export default [
  ["flower heads and stems leave the grass behind them intact on light and dark backgrounds", async ctx => {
    for (const theme of ["light", "dark"]) {
      const grass = await alpha(ctx, theme, []);
      const flowers = await alpha(ctx, theme, garden);
      assert.equal(flowers.length, grass.length);
      const missing = grass.filter((opacity, index) => flowers[index] + 1 < opacity).length;
      assert.equal(missing, 0, `${theme}: ${missing} grass pixels lost opacity when flowers were drawn`);
    }
  }],
];
