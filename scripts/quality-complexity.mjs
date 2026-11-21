#!/usr/bin/env node
// Per-function cyclomatic and cognitive complexity of production TS/TSX.
// Values come from the same rules as eslint.config.js (ESLint `complexity`, classic
// variant; SonarJS `cognitive-complexity`, own complexity of each function). The rules run
// with threshold 0 so that every function reports its value; the report call is
// intercepted to keep the AST node, which gives the full source range for CRAP.
// CLI: node scripts/quality-complexity.mjs [out.txt]  (default coverage/complexity.txt)
import { mkdirSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { pathToFileURL } from "node:url";
import { ESLint } from "eslint";
import { builtinRules } from "eslint/use-at-your-own-risk";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import { limits } from "../eslint.config.js";

export { limits };

// Wrap a rule: every report becomes a measurement {node, value} instead of a lint message.
function probe(rule, metric, valueOf, sink) {
  return {
    meta: rule.meta,
    create(context) {
      let current; // SonarJS reports from ':function:exit' without `node`
      const report = d => sink(context.filename, d.node ?? current, metric, valueOf(d));
      const listeners = rule.create(Object.create(context, { report: { value: report } }));
      const exit = listeners[":function:exit"];
      if (exit) listeners[":function:exit"] = node => { current = node; exit(node); };
      return listeners;
    },
  };
}

/** @returns {Promise<Array<{file,name,start,end,cyclomatic,cognitive}>>} lines/columns are 1/0-based like ESLint loc. */
export async function measureComplexity(files, root = process.cwd()) {
  const functions = new Map();
  const sink = (file, node, metric, value) => {
    const key = `${file}:${node.range}`;
    const fn = functions.get(key) ?? { file: relative(root, file), start: node.loc.start, end: node.loc.end, cyclomatic: 0, cognitive: 0 };
    fn[metric] = value.amount;
    if (value.name) fn.name = value.name;
    functions.set(key, fn);
  };
  const plugin = { rules: {
    cyclomatic: probe(builtinRules.get("complexity"), "cyclomatic", d => ({ amount: d.data.complexity, name: d.data.name }), sink),
    cognitive: probe(sonarjs.rules["cognitive-complexity"], "cognitive", d => ({ amount: Number(d.data.complexityAmount) }), sink),
  } };
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: {
      files: ["**/*.ts", "**/*.tsx"],
      languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { probe: plugin },
      rules: { "probe/cyclomatic": ["error", { max: 0, variant: "classic" }], "probe/cognitive": ["error", 0] },
    },
  });
  const results = await eslint.lintFiles(files);
  const fatal = results.flatMap(r => r.messages.filter(m => m.fatal).map(m => `${r.filePath}:${m.line} ${m.message}`));
  if (fatal.length) throw new Error(`Parse errors:\n${fatal.join("\n")}`);
  return [...functions.values()].sort((a, b) => a.file.localeCompare(b.file) || a.start.line - b.start.line || a.start.column - b.start.column);
}

export function complexityReport(functions) {
  const lines = [`Per-function complexity. Limits: cyclomatic <= ${limits.cyclomatic}, cognitive <= ${limits.cognitive}. "!" = over limit.`];
  for (const file of [...new Set(functions.map(f => f.file))]) {
    const own = functions.filter(f => f.file === file);
    const bad = own.filter(f => f.cyclomatic > limits.cyclomatic || f.cognitive > limits.cognitive);
    lines.push("", `${file}: ${own.length} functions, ${bad.length} over limit, max CC ${Math.max(...own.map(f => f.cyclomatic))}, max cognitive ${Math.max(...own.map(f => f.cognitive))}`);
    for (const f of own) {
      const mark = f.cyclomatic > limits.cyclomatic || f.cognitive > limits.cognitive ? "!" : " ";
      lines.push(`${mark} ${String(f.start.line).padStart(4)}-${String(f.end.line).padEnd(4)} CC ${String(f.cyclomatic).padStart(2)}  cog ${String(f.cognitive).padStart(2)}  ${f.name}`);
    }
  }
  return lines.join("\n") + "\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { productionFiles } = await import("./quality-files.mjs");
  const out = process.argv[2] ?? "coverage/complexity.txt";
  mkdirSync("coverage", { recursive: true });
  const report = complexityReport(await measureComplexity(productionFiles()));
  writeFileSync(out, report);
  process.stdout.write(report + `\nWritten to ${out}\n`);
}
