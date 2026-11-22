// Settings on the back of the meadow card: open, close, Escape, persisted choices.
import assert from "node:assert/strict";
import { KEY, turns, withMeadow } from "../harness/meadow.mjs";

const focused = m => m.page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
const chip = (m, name) => m.page.getByRole("button", { name, exact: true });
const pressed = (m, name) => chip(m, name).getAttribute("aria-pressed");
const expanded = m => m.toggle.getAttribute("aria-expanded");
// Measure the chosen layout height independently of the card’s in-flight 3D rotation.
const layoutHeight = m => m.canvas.evaluate(canvas => canvas.clientHeight);

export default [
  ["the toggle opens settings, Escape closes them in place; choices persist", ctx => withMeadow(ctx, { rows: turns(20) }, async m => {
    const compact = await layoutHeight(m);
    await m.bb(() => {
      window.leaked = [];
      document.addEventListener("keydown", e => window.leaked.push(e.key));
    });
    assert.equal(await expanded(m), "false");
    assert.equal(await m.toggle.getAttribute("aria-label"), "Настройки луга");
    const spot = await m.toggle.boundingBox();
    await m.toggle.click();
    await m.page.waitForTimeout(350); // the flip hides the front half-way through
    assert.equal(await expanded(m), "true");
    assert.ok(await m.page.getByRole("group", { name: "Настройки луга" }).isVisible());
    assert.equal(await m.canvas.isVisible(), false, "the grass face is turned away");
    assert.equal(await focused(m), "Вернуться к лугу", "focus stays on the same control, now 'back'");
    assert.deepEqual(await m.toggle.boundingBox(), spot, "the toggle does not move when the card flips");
    assert.ok(await m.root.evaluate(el => el.getBoundingClientRect().height) >= 30, "room for one settings row");

    await chip(m, "Размер: высокий").click();
    assert.equal(await pressed(m, "Размер: высокий"), "true");
    assert.equal(await pressed(m, "Размер: компактный"), "false");
    await chip(m, "Пчела").click();
    assert.equal(await pressed(m, "Пчела"), "false");
    assert.equal(await chip(m, "Пчела").getAttribute("title"), "Пчела: не прилетает");
    await m.page.keyboard.press("Tab");
    assert.equal(await expanded(m), "true", "other keys keep settings open");
    await m.page.keyboard.press("Escape");
    await m.run(50);
    assert.equal(await expanded(m), "false");
    assert.equal(await focused(m), "Настройки луга", "focus returns to the toggle");
    assert.deepEqual(await m.bb(() => window.leaked), ["Tab"], "Escape does not reach the chat");
    await m.page.keyboard.press("Escape");
    assert.deepEqual(await m.bb(() => window.leaked), ["Tab", "Escape"], "a closed meadow leaves Escape to the chat");
    const tall = await layoutHeight(m);
    assert.ok(tall > compact * 1.5, `tall meadow: ${compact} -> ${tall}`);
    assert.equal(await m.storage(KEY.size), "full");
    assert.deepEqual(JSON.parse(await m.storage(KEY.guests)), { bee: false, butterfly: true });

    await m.reload();
    assert.equal(await layoutHeight(m), tall, "size survives a reload");
    await m.toggle.click();
    assert.equal(await pressed(m, "Пчела"), "false");
    assert.equal(await pressed(m, "Бабочка"), "true");
    await chip(m, "Размер: компактный").click();
    await m.toggle.click();
    await m.run(50);
    assert.equal(await expanded(m), "false");
    assert.equal(await layoutHeight(m), compact);
  })],

  ["with reduced motion the sides swap instantly", ctx => withMeadow(ctx, { reducedMotion: "reduce" }, async m => {
    await m.toggle.click();
    assert.ok(await chip(m, "Бабочка").isVisible());
    assert.equal(await m.canvas.isVisible(), false);
    await m.page.keyboard.press("Escape");
    assert.ok(await m.canvas.isVisible());
  })],

  ["English BB gets an English meadow", ctx => withMeadow(ctx, { lang: "en-GB" }, async m => {
    assert.equal(await m.root.getAttribute("aria-label"), "This chat’s meadow");
    await m.toggle.click();
    assert.equal(await m.toggle.getAttribute("aria-label"), "Back to meadow");
    assert.ok(await chip(m, "Size: tall").isVisible());
  })],

  ["a first install opens Overgrown; an explicit choice is saved and kept", async ctx => {
    let saved;
    await withMeadow(ctx, { size: null, rows: turns(0) }, async m => {
      assert.equal(await m.storage(KEY.size), null, "nothing is written just by opening");
      await m.run(60_000);
      assert.ok(await layoutHeight(m) > 150, `Overgrown canopy over the chat even without turns: ${await layoutHeight(m)}`);
      await m.toggle.click();
      assert.equal(await pressed(m, "Размер: заросли"), "true");
      await chip(m, "Размер: высокий").click();
      saved = await m.storage(KEY.size);
      await m.page.keyboard.press("Escape");
      await m.run(50);
      const tall = await layoutHeight(m);
      assert.ok(tall <= 72, `Tall strip after choosing it: ${tall}`);
      await m.reload();
      assert.equal(await layoutHeight(m), tall, "the choice survives a reload");
    });
    assert.equal(saved, "full");
    for (const size of ["compact", "full"]) await withMeadow(ctx, { size }, async m => {
      await m.toggle.click();
      assert.equal(await pressed(m, size === "full" ? "Размер: высокий" : "Размер: компактный"), "true", `saved ${size} is kept`);
    });
  }],

  ["damaged saved settings fall back to defaults", ctx => withMeadow(ctx, {
    storage: { [KEY.size]: "huge", [KEY.guests]: "{not json" },
  }, async m => {
    await m.toggle.click();
    assert.equal(await pressed(m, "Размер: заросли"), "true", "an unknown size opens like a first install");
    assert.equal(await pressed(m, "Пчела"), "true");
    assert.equal(await pressed(m, "Бабочка"), "true");
  })],

  ["blocked storage still lets the user change settings for the session", ctx => withMeadow(ctx, { blockStorage: true, rows: turns(20) }, async m => {
    await m.toggle.click();
    assert.equal(await pressed(m, "Размер: заросли"), "true", "nothing saved: the default Overgrown");
    await chip(m, "Размер: компактный").click();
    await m.page.keyboard.press("Escape");
    await m.run(50);
    const compact = await layoutHeight(m);
    await m.toggle.click();
    await chip(m, "Размер: высокий").click();
    await chip(m, "Бабочка").click();
    assert.equal(await pressed(m, "Бабочка"), "false");
    await m.page.keyboard.press("Escape");
    await m.run(50);
    assert.ok(await layoutHeight(m) > compact);
  })],
];
