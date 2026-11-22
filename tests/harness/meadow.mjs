// Opens the fake BB chat with the plugin and offers observations of what a user sees:
// canvas pixels, drawn colours and positions, DOM controls, localStorage, host calls.
import assert from "node:assert/strict";

export const THREAD = "thr_meadow";
export const ORIGIN = "http://bb.test";
export const KEY = { size: "bb-touch-grass:size", guests: "bb-touch-grass:guests", garden: `bb-touch-grass:garden:${THREAD}`, bloom: `bb-touch-grass:bloom:${THREAD}` };
/** Start of the fake clock; bloom storage contains the next deadline. */
export const CLOCK_START = Date.parse("2026-11-21T12:00:00Z");
export const COLORS = {
  bee: "#efb62a",
  butterflies: ["#f4f1e6", "#e98a3a", "#7ea7e6", "#f2d64b"],
  mower: "#c8432f",
  berry: "#d8333b",
  petals: ["#f7f4ec", "#5d82d8", "#d97ba7", "#f3c531"],
};

export const turns = (n, type = "turn/started") => Array.from({ length: n }, () => ({ type, data: {} }));
export const tool = (type, args = "example private tool argument") => ({ type: "item/started", data: { item: { type, args } } });
export const usage = total => ({ type: "thread/tokenUsage/updated", data: { tokenUsage: { total, last: total } } });

const pageHtml = lang => `<!doctype html><html lang="${lang}"><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/page.css"><style>
body{margin:0;font:14px system-ui;background:var(--background)}
.chat{display:flex;flex-direction:column;height:100vh;padding:0 16px;box-sizing:border-box}
.messages{flex:1}.composer{min-height:64px;border:1px solid #8884;border-radius:12px;margin:0 0 12px}
</style></head><body><main class="chat"><div class="messages"></div><div id="banner"></div>
<div class="composer" contenteditable="true" aria-label="Сообщение"></div></main><script src="/page.js"></script></body></html>`;

function seedPage({ seed, storage, blockStorage }) {
  window.__seed = seed;
  if (seed.random !== undefined) Math.random = () => seed.random;
  if (blockStorage) {
    Storage.prototype.getItem = () => { throw new DOMException("denied", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("denied", "SecurityError"); };
  } else if (!sessionStorage.getItem("seeded")) {
    sessionStorage.setItem("seeded", "1");
    for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
  }
  // Remember the latest drawing of every fill colour on the meadow canvas.
  window.__seen = {};
  const fill = CanvasRenderingContext2D.prototype.fill;
  CanvasRenderingContext2D.prototype.fill = function (...args) {
    if (this.canvas.closest?.("[data-bb-plugin]")) {
      const t = this.getTransform();
      const dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth);
      window.__seen[String(this.fillStyle)] = { x: t.e / dpr, y: t.f / dpr };
    }
    return fill.apply(this, args);
  };
}

export async function openMeadow(ctx, options = {}) {
  // `size` is the meadow size the user saved earlier. Scenarios of the turn-based meadow
  // run in Compact unless they pass another size; `size: null` opens like a first install.
  const { rows = turns(12), threads, scope, size = "compact", background, blockStorage = false, clock = true,
    viewport = { width: 1100, height: 760 }, reducedMotion = "no-preference", colorScheme = "light",
    hasTouch = false, isMobile = false, deviceScaleFactor = 1, waitFor = "canvas", lang = "ru" } = options;
  const context = await ctx.browser.newContext({ viewport, reducedMotion, colorScheme, hasTouch, isMobile, deviceScaleFactor });
  context.setDefaultTimeout(5000);
  const page = await context.newPage();
  const meadow = new Meadow(ctx, context, page);
  page.on("pageerror", error => meadow.errors.push(String(error.stack ?? error.message).split("\n").slice(0, 3).join(" | ")));
  page.on("console", message => meadow.console.push(`${message.type()}: ${message.text()}`));
  await page.route(`${ORIGIN}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/page.js") return route.fulfill({ body: ctx.assets.js, contentType: "text/javascript" });
    if (path === "/page.css") return route.fulfill({ body: ctx.assets.css, contentType: "text/css" });
    return route.fulfill({ body: pageHtml(lang), contentType: "text/html" });
  });
  const storage = { ...(size ? { [KEY.size]: size } : {}), ...options.storage };
  const seed = { threads: threads ?? { [THREAD]: rows }, scope, background, random: options.random };
  await page.addInitScript(seedPage, { seed, storage, blockStorage });
  if (clock) await page.clock.install({ time: new Date(CLOCK_START) });
  await page.goto(`${ORIGIN}/projects/demo/threads/${THREAD}`);
  if (waitFor === "canvas") await meadow.ready();
  return meadow;
}

/** Runs a scenario on a fresh page; coverage is kept even when the scenario fails. */
export async function withMeadow(ctx, options, scenario) {
  const meadow = await openMeadow(ctx, options);
  try {
    await scenario(meadow);
  } catch (error) {
    await meadow.collect().catch(() => {});
    await meadow.context.close();
    if (meadow.errors.length) error.message += `\npage errors: ${meadow.errors.join("; ")}`;
    throw error;
  }
  await meadow.close();
}

export class Meadow {
  constructor(ctx, context, page) {
    Object.assign(this, { ctx, context, page, errors: [], console: [] });
    this.root = page.locator("[data-bb-plugin=touch-grass] .tg-meadow");
    this.canvas = this.root.locator("canvas");
    this.mowButton = page.getByRole("button", { name: /покосить/i });
    this.scytheButton = page.getByRole("button", { name: /^Коса/ });
    this.toggle = this.root.locator("button[aria-expanded]"); // settings ⇄ back to the meadow
  }

  async ready(ms = 2000) {
    await this.page.clock.runFor(60);
    await this.canvas.waitFor({ state: "attached", timeout: 5000 });
    await this.run(ms);
  }

  run(ms) { return this.page.clock.runFor(ms); }
  bb(fn, arg) { return this.page.evaluate(fn, arg); }
  async storage(key) { return this.page.evaluate(k => { try { return localStorage.getItem(k); } catch { return null; } }, key); }
  async garden() { return JSON.parse((await this.storage(KEY.garden)) ?? "[]"); }
  async box() { return this.canvas.boundingBox(); }
  async height() { return this.canvas.evaluate(el => el.getBoundingClientRect().height); }
  async calls(method) { return this.bb(m => window.bb.calls.filter(c => c.method === m), method); }
  async forget() { await this.bb(() => { window.__seen = {}; }); }
  /** Drawn since the last forget(): colour → last position in canvas CSS px. */
  async seen(colors) { return this.bb(cs => cs.map(c => window.__seen[c]).filter(Boolean), colors); }
  /** Short fingerprint of the current canvas picture. */
  async pixels() {
    return this.canvas.evaluate(el => {
      const data = el.toDataURL();
      let h = 2166136261;
      for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data.charCodeAt(i), 16777619);
      return `${el.width}x${el.height}:${(h >>> 0).toString(16)}`;
    });
  }

  /** 70th percentile grass height in CSS px over horizontal zones [from, to] (fractions). */
  async grass(...zones) {
    return this.canvas.evaluate((el, zs) => {
      const { width: w, height: h } = el;
      const dpr = w / el.clientWidth;
      const rgba = el.getContext("2d").getImageData(0, 0, w, h).data;
      return zs.map(([from, to]) => {
        const columns = [];
        for (let x = Math.ceil(from * w); x < to * w; x++) {
          let y = 0;
          for (; y < h; y++) {
            const i = (y * w + x) * 4;
            if (rgba[i + 3] > 72 && rgba[i + 1] > rgba[i] && rgba[i + 1] > rgba[i + 2]) break;
          }
          columns.push(h - y);
        }
        columns.sort((a, b) => a - b);
        return columns[Math.floor(columns.length * 0.7)] / dpr;
      });
    }, zones.length ? zones : [[0, 1]]);
  }

  /** Share of canvas columns with any grass in them. */
  async cover() {
    return this.canvas.evaluate(el => {
      const { width: w, height: h } = el;
      const rgba = el.getContext("2d").getImageData(0, 0, w, h).data;
      let filled = 0;
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          const i = (y * w + x) * 4;
          if (rgba[i + 3] > 72 && rgba[i + 1] > rgba[i]) { filled++; break; }
        }
      }
      return filled / w;
    });
  }

  /** Mean green-over-red of opaque grass pixels: higher is a lusher meadow. */
  async greenness() {
    return this.canvas.evaluate(el => {
      const rgba = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
      let sum = 0, n = 0;
      for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] > 120) { sum += rgba[i + 1] - rgba[i]; n++; }
      return sum / n;
    });
  }

  /** Point in page coordinates for canvas CSS coordinates. */
  async at(x, y) {
    const box = await this.box();
    return { x: box.x + x, y: box.y + y };
  }

  async stroke(x, y, { reach = 22, sweeps = 1, steps = 6 } = {}) {
    for (let i = 0; i < sweeps; i++) {
      await this.page.mouse.move(x - reach, y, { steps });
      await this.page.mouse.move(x + reach, y, { steps });
    }
  }

  async reload() {
    await this.collect();
    await this.page.reload();
    await this.ready();
  }

  async collect() {
    this.ctx.coverage.merge(await this.page.evaluate(() => window.__coverage__));
  }

  async close() {
    await this.collect();
    await this.context.close();
    assert.deepEqual(this.errors, [], "no uncaught page errors");
  }
}
