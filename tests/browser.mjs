#!/usr/bin/env node
// Behavioural browser checks of the plugin, run against the real production modules in
// headless Chromium with a fake BB host. Writes Istanbul coverage of every production
// TS/TSX file (zero counters for code no scenario reached) to coverage/coverage-final.json.
// CLI: node tests/browser.mjs [name filter]
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { productionFiles } from "../scripts/quality-files.mjs";
import { buildPage } from "./harness/build.mjs";
import { launchBrowser } from "./harness/chrome.mjs";
import { createCoverage, lineSummary } from "./harness/coverage.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const groups = readdirSync(new URL("./scenarios/", import.meta.url))
  .filter(file => file.endsWith(".mjs")).map(file => file.slice(0, -4)).sort();
const filter = process.argv[2] ?? "";

const assets = await buildPage(root);
const coverage = createCoverage();
const browser = await launchBrowser();
const ctx = { browser, assets, coverage };
const failures = [];
let executed = 0;
try {
  for (const group of groups) {
    const { default: scenarios } = await import(`./scenarios/${group}.mjs`);
    for (const [name, scenario] of scenarios) {
      const title = `${group}: ${name}`;
      if (!title.includes(filter)) continue;
      executed++;
      const started = Date.now();
      try {
        await scenario(ctx);
        console.log(`ok   ${title} (${Date.now() - started} ms)`);
      } catch (error) {
        failures.push(title);
        console.log(`FAIL ${title}\n     ${String(error.stack ?? error).split("\n").slice(0, 16).join("\n     ")}`);
      }
    }
  }
} finally {
  await browser.close();
}

if (!executed) throw new Error(`No browser scenarios matched "${filter}"`);

const production = [...new Set([...productionFiles(root), ...assets.instrumented.map(f => f.slice(root.length))])];
const { out, files } = coverage.write(root, production, filter ? "coverage-filtered.json" : "coverage-final.json");
const lines = lineSummary(files);
console.log(`coverage: ${lines.covered}/${lines.total} executable lines (${lines.pct.toFixed(1)}%) in ${production.length} files -> ${out}`);
console.log(failures.length ? `${failures.length} scenario(s) failed` : "all scenarios passed");
process.exit(failures.length ? 1 : 0);
