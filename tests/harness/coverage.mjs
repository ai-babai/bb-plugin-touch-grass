// Istanbul coverage accumulated over many pages (every page load has its own counters),
// completed with zero counters for production files that were never loaded.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emptyCoverage } from "../../scripts/quality-instrument.mjs";

const add = (into, from) => {
  for (const id of Object.keys(from.s)) into.s[id] += from.s[id];
  for (const id of Object.keys(from.f)) into.f[id] += from.f[id];
  for (const id of Object.keys(from.b)) into.b[id] = into.b[id].map((n, i) => n + from.b[id][i]);
};

export function createCoverage() {
  const files = {};
  return {
    merge(coverage) {
      for (const [file, data] of Object.entries(coverage ?? {})) {
        if (files[file]) add(files[file], data);
        else files[file] = structuredClone(data);
      }
    },
    write(root, production, reportName = "coverage-final.json") {
      for (const file of production) {
        const path = join(root, file);
        files[path] ??= emptyCoverage(readFileSync(path, "utf8"), path);
      }
      const out = join(root, "coverage", reportName);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(files));
      return { out, files };
    },
  };
}

export function lineSummary(files) {
  let covered = 0, total = 0;
  for (const data of Object.values(files)) {
    const lines = new Map();
    for (const [id, loc] of Object.entries(data.statementMap)) {
      const line = loc.start.line;
      lines.set(line, (lines.get(line) ?? 0) + data.s[id]);
    }
    total += lines.size;
    covered += [...lines.values()].filter(Boolean).length;
  }
  return { covered, total, pct: total ? (100 * covered) / total : 100 };
}
