#!/usr/bin/env node
// npm run quality [-- --base <git ref>]
//
// One reproducible gate for the plugin. Measured set: every production TS/TSX file
// discovered from tsconfig and its imports (entrypoints, hooks and canvas code).
// Baseline for diff coverage: merge-base of --base (or $QUALITY_BASE, default
// archive/fireflies-v1) with HEAD, compared with the working tree (+ untracked files).
//
// Steps and limits:
//   typecheck      tsc -p . has no errors
//   complexity     per function: cyclomatic <= 10 (ESLint `complexity`, classic),
//                  cognitive <= 15 (SonarJS); gate = `eslint` with eslint.config.js
//   cycles         dpdm over all production files, type imports included: 0 cycles
//   server         fast-check properties + selective mutants killed by assertions
//   browser        node tests/browser.mjs -> coverage/coverage-final.json (Istanbul)
//   CRAP           CC² · (1 − cov)³ + CC per function; cov = covered / executable lines of
//                  the function's own statements (nested functions excluded); mean < 5, max <= 30
//   diff coverage  executable changed lines (Istanbul statement start lines) covered >= 80%
// Coverage: canonical Istanbul statement map of each production file (uncovered files
// count as 0%), hits merged by statement start position from browser + server runs.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { complexityReport, limits, measureComplexity } from "./quality-complexity.mjs";
import { productionFiles } from "./quality-files.mjs";
import { emptyCoverage } from "./quality-instrument.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
process.chdir(root);
const argBase = process.argv.indexOf("--base");
const baseRef = argBase > 0 ? process.argv[argBase + 1] : process.env.QUALITY_BASE ?? "archive/fireflies-v1";
const gate = { crapMean: 5, crapMax: 30, diffCoverage: 0.8 };
const files = productionFiles(root);
const results = [];
const report = [];
const log = line => { report.push(line); console.log(line); };
const check = (name, ok, detail) => { results.push({ name, ok }); log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`); };
const run = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit" }).status === 0;
const git = (...args) => spawnSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
function gitOutput(...args) {
  const result = git(...args);
  if (result.status !== 0 || result.error) throw result.error ?? new Error(result.stderr);
  return result.stdout;
}

log(`Production files (${files.length}): ${files.join(", ")}`);

// ---- typecheck, complexity, cycles ------------------------------------------------------
console.log("\n> tsc -p .");
check("typecheck", run("npx", ["tsc", "-p", "."]), "tsc -p .");

const functions = await measureComplexity(files, root);
mkdirSync("coverage", { recursive: true });
writeFileSync("coverage/complexity.txt", complexityReport(functions));
const over = functions.filter(f => f.cyclomatic > limits.cyclomatic || f.cognitive > limits.cognitive);
const lint = await new ESLint({ cwd: root }).lintFiles(files);
const lintErrors = lint.flatMap(r => r.messages.map(m => `${relative(root, r.filePath)}:${m.line} ${m.message}`));
const measuredViolations = over.reduce((n, f) => n + (f.cyclomatic > limits.cyclomatic) + (f.cognitive > limits.cognitive), 0);
if (lintErrors.length !== measuredViolations) throw new Error(`eslint (${lintErrors.length}) and measurement (${measuredViolations}) disagree`);
check("complexity", lintErrors.length === 0, `${functions.length} functions, ${over.length} over CC ${limits.cyclomatic} / cognitive ${limits.cognitive}`
  + over.map(f => `\n    ${f.file}:${f.start.line} ${f.name}: CC ${f.cyclomatic}, cognitive ${f.cognitive}`).join(""));

mkdirSync("coverage", { recursive: true });
const dpdm = spawnSync("npx", ["dpdm", "--no-tree", "--no-warning", "--no-progress", "--tsconfig", "tsconfig.json", "--output", "coverage/dpdm.json", ...files], { encoding: "utf8" });
const circulars = dpdm.status === 0 ? JSON.parse(readFileSync("coverage/dpdm.json", "utf8")).circulars : null;
check("circular dependencies", circulars?.length === 0, circulars ? `${circulars.length}${circulars.map(c => `\n    ${c.join(" -> ")}`).join("")}` : `dpdm failed: ${dpdm.stderr}`);

// ---- executed checks producing coverage -------------------------------------------------
console.log("\n> node scripts/quality-server.mjs");
check("server properties + mutation", run("node", ["scripts/quality-server.mjs"]), "see output above");
rmSync("coverage/coverage-final.json", { force: true });
const hasBrowser = existsSync("tests/browser.mjs");
console.log("\n> node tests/browser.mjs");
check("browser test", hasBrowser && run("node", ["tests/browser.mjs"]) && existsSync("coverage/coverage-final.json"),
  hasBrowser ? "coverage/coverage-final.json" : "tests/browser.mjs is missing");

// ---- coverage merge ---------------------------------------------------------------------
const hits = new Map(); // "file:line:col" -> hit count
for (const source of ["coverage/coverage-final.json", "coverage/server/coverage-final.json"].filter(existsSync)) {
  for (const [path, data] of Object.entries(JSON.parse(readFileSync(source, "utf8")))) {
    const file = relative(root, resolve(root, (data.path ?? path).split("?")[0]));
    for (const [id, loc] of Object.entries(data.statementMap)) {
      const key = `${file}:${loc.start.line}:${loc.start.column}`;
      hits.set(key, (hits.get(key) ?? 0) + data.s[id]);
    }
  }
}
const statements = files.flatMap(file => Object.values(emptyCoverage(readFileSync(file, "utf8"), resolve(file)).statementMap)
  .map(({ start }) => ({ file, line: start.line, column: start.column, hit: (hits.get(`${file}:${start.line}:${start.column}`) ?? 0) > 0 })));
const lineHit = new Map(); // "file:line" -> covered (any statement starting on the line executed)
for (const s of statements) lineHit.set(`${s.file}:${s.line}`, (lineHit.get(`${s.file}:${s.line}`) ?? false) || s.hit);
for (const file of files) {
  const own = [...lineHit].filter(([k]) => k.startsWith(`${file}:`));
  log(`    line coverage ${file}: ${own.filter(([, v]) => v).length}/${own.length}`);
}

// ---- CRAP ---------------------------------------------------------------------------------
const before = (a, b) => a.line < b.line || (a.line === b.line && a.column <= b.column);
const owner = s => functions.filter(f => f.file === s.file && before(f.start, s) && before(s, f.end))
  .reduce((best, f) => (!best || before(best.start, f.start) ? f : best), undefined);
for (const s of statements) {
  const f = owner(s); // innermost function containing the statement start
  if (!f) continue; // module-level statement: counts for diff coverage only
  f.lines ??= new Map();
  f.lines.set(s.line, (f.lines.get(s.line) ?? false) || s.hit);
}
for (const f of functions) {
  const lines = [...(f.lines ?? new Map()).values()];
  f.coverage = lines.length ? lines.filter(Boolean).length / lines.length : 0;
  f.crap = f.cyclomatic ** 2 * (1 - f.coverage) ** 3 + f.cyclomatic;
}
const crapMean = functions.reduce((n, f) => n + f.crap, 0) / functions.length;
const worst = [...functions].sort((a, b) => b.crap - a.crap);
const crapOver = worst.filter(f => f.crap > gate.crapMax);
check("CRAP", crapMean < gate.crapMean && crapOver.length === 0, `mean ${crapMean.toFixed(2)} (< ${gate.crapMean}), max ${worst[0].crap.toFixed(1)} (<= ${gate.crapMax}), ${crapOver.length} over`
  + worst.slice(0, Math.max(5, crapOver.length)).map(f => `\n    ${f.file}:${f.start.line} ${f.name}: CRAP ${f.crap.toFixed(1)}, CC ${f.cyclomatic}, cov ${(100 * f.coverage).toFixed(0)}%`).join(""));

// ---- diff coverage ------------------------------------------------------------------------
const resolveRef = ref => [ref, `origin/${ref}`].find(r => git("rev-parse", "--verify", "--quiet", `${r}^{commit}`).status === 0);
const base = resolveRef(baseRef);
if (!base) {
  check("diff coverage", false, `base ref ${baseRef} not found (fetch it or pass --base <ref>)`);
} else {
  const mergeBase = gitOutput("merge-base", base, "HEAD").trim();
  const changed = new Map(files.map(f => [f, new Set()]));
  let file;
  for (const line of gitOutput("diff", "-U0", "--no-color", "--no-ext-diff", mergeBase, "--", ...files).split("\n")) {
    if (line.startsWith("+++ ")) file = line.replace(/^\+\+\+ b\//, "");
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && changed.has(file)) for (let n = 0; n < Number(hunk[2] ?? 1); n++) changed.get(file).add(Number(hunk[1]) + n);
  }
  for (const f of gitOutput("ls-files", "--others", "--exclude-standard", "--", ...files).split("\n").filter(Boolean)) {
    readFileSync(f, "utf8").split("\n").forEach((_, i) => changed.get(f).add(i + 1));
  }
  const executable = [...lineHit].filter(([k]) => { const [f, l] = k.split(":"); return changed.get(f)?.has(Number(l)); });
  const missed = executable.filter(([, v]) => !v).map(([k]) => k);
  const ratio = executable.length ? (executable.length - missed.length) / executable.length : 1;
  check("diff coverage", ratio >= gate.diffCoverage, `${(100 * ratio).toFixed(1)}% of ${executable.length} executable changed lines (>= ${100 * gate.diffCoverage}%) vs ${baseRef} merge-base ${mergeBase.slice(0, 7)}`
    + files.map(f => [f, missed.filter(k => k.startsWith(`${f}:`)).length]).filter(([, n]) => n).map(([f, n]) => `\n    ${f}: ${n} uncovered`).join(""));
}

const failed = results.filter(r => !r.ok).map(r => r.name);
log(`\n${failed.length ? `QUALITY FAILED: ${failed.join(", ")}` : "QUALITY PASSED"}`);
writeFileSync("coverage/quality-report.txt", report.join("\n") + "\n");
process.exit(failed.length ? 1 : 0);
