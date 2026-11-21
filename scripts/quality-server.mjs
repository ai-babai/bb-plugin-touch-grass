#!/usr/bin/env node
// Property and selective mutation checks for the server RPC (server.ts) through a fake
// SDK façade: bb.rpc.register + bb.sdk.threads.events.list.
//   1. Properties run against the Istanbul-instrumented server.ts and write
//      coverage/server/coverage-final.json (positions refer to the original TS).
//   2. Each mutant is server.ts with exactly one textual change. It counts as killed only
//      when a property fails with an AssertionError; a crash (TypeError, …) is reported
//      as "error" and fails the gate, as does a surviving or no longer applicable mutant.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import fc from "fast-check";
import ts from "typescript";
import { instrument } from "./quality-instrument.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const serverUrl = pathToFileURL(`${root}server.ts`).href;
const seed = Number(process.env.QUALITY_SEED ?? 20261121);
const numRuns = Number(process.env.QUALITY_RUNS ?? 400);

// [description, from, to] — `from` must occur exactly once in server.ts.
export const mutants = [
  ["tool share divisor 12 -> 13", "calls / 12", "calls / 13"],
  ["clamp min -> max", "Math.min(1, calls / 12)", "Math.max(1, calls / 12)"],
  ["null on empty items -> on zero calls", "items.length ? Math", "calls ? Math"],
  ["count non-tool items", "&& toolKinds.has(row.data.item.type)", "&& !toolKinds.has(row.data.item.type)"],
  ["ignore row type", 'row.type === "item/started" &&', "true &&"],
  ["drop delegation kind", '"webSearch", "delegation",', '"webSearch",'],
  ["reads >= 0 -> > 0", "reads >= 0", "reads > 0"],
  ["reads <= allInput -> <", "reads <= allInput", "reads < allInput"],
  ["allInput > 0 -> >= 0", "allInput > 0", "allInput >= 0"],
  ["output tokens counted as input", "tokens.totalTokens - tokens.outputTokens", "tokens.totalTokens"],
  ["cache writes not subtracted", "(tokens.cacheWriteInputTokens ?? 0)", "0"],
  ["Claude cache reads ignored", "tokens.cacheReadInputTokens ?? ", ""],
  ["share inverted", "cacheReadShare = reads / allInput", "cacheReadShare = 1 - reads / allInput"],
  ["latest usage -> oldest", 'order: "desc", limit: "1"', 'order: "asc", limit: "1"'],
  ["item window 24 -> 25", 'limit: "24"', 'limit: "25"'],
];

registerHooks({
  load(url, context, next) {
    if (!url.startsWith(serverUrl)) return next(url, context);
    let source = readFileSync(fileURLToPath(serverUrl), "utf8");
    const mutant = new URL(url).searchParams.get("mutant");
    if (mutant === null) source = instrument(source, fileURLToPath(serverUrl));
    else {
      const [, from, to] = mutants[Number(mutant)];
      const at = source.indexOf(from);
      if (at < 0 || source.indexOf(from, at + 1) >= 0) throw new Error(`mutant not applicable: ${from}`);
      source = source.slice(0, at) + to + source.slice(at + from.length);
    }
    const options = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };
    return { format: "module", shortCircuit: true, source: ts.transpileModule(source, { compilerOptions: options }).outputText };
  },
});

// ---- SDK façade -------------------------------------------------------------------------
const toolKinds = ["commandExecution", "fileChange", "fileRead", "imageGeneration", "imageView",
  "search", "toolCall", "webFetch", "webSearch", "delegation"];
const otherKinds = ["agentMessage", "reasoning", "userMessage", "plan", "contextCompaction"];

async function callServer(mod, { usage, items, threadId = "thread-1" }) {
  const queries = [];
  let handlers;
  mod.default({
    rpc: { register(contract, h) { assert.equal(contract, mod.contract); handlers = h; } },
    sdk: { threads: { events: { async list(query) {
      queries.push(query);
      return query.types[0] === "thread/tokenUsage/updated" ? usage : items;
    } } } },
  });
  const result = await handlers.meadow_activity({ threadId });
  return { result, queries };
}

// ---- Generators --------------------------------------------------------------------------
const count = fc.oneof(fc.integer({ min: 0, max: 8 }), fc.nat({ max: 2_000_000 }));
const totals = fc.record({
  totalTokens: count, outputTokens: count, inputTokens: count, cachedInputTokens: count,
  cacheReadInputTokens: fc.option(count, { nil: undefined }),
  cacheWriteInputTokens: fc.option(count, { nil: undefined }),
}, { requiredKeys: ["totalTokens", "outputTokens", "inputTokens", "cachedInputTokens"] });
// Realistic usage: input = uncached + cache reads (+ writes), with exact boundaries such as
// "everything read from cache" (share 1) and "nothing cached" (share 0) generated often.
const realistic = fc.record({ output: count, reads: count, uncached: fc.oneof(fc.constant(0), count),
  writes: fc.oneof(fc.constant(0), count), claude: fc.boolean() }).map(({ output, reads, uncached, writes, claude }) => {
  const totalTokens = output + reads + uncached + writes;
  return claude
    ? { totalTokens, outputTokens: output, inputTokens: uncached, cachedInputTokens: 0, cacheReadInputTokens: reads, cacheWriteInputTokens: writes }
    : { totalTokens: totalTokens - writes, outputTokens: output, inputTokens: reads + uncached, cachedInputTokens: reads + writes, cacheWriteInputTokens: writes };
});
const usageRow = fc.oneof(totals, realistic).map(total => ({ type: "thread/tokenUsage/updated", data: { tokenUsage: { total, last: total } } }));
const usageRows = fc.oneof(fc.constant([]), usageRow.map(r => [r]), fc.constant([{ type: "turn/started", data: {} }]));
const item = fc.oneof(
  fc.constantFrom(...toolKinds, ...otherKinds).map(type => ({ type: "item/started", data: { item: { type, args: "secret" } } })),
  fc.constantFrom(...toolKinds).map(type => ({ type: "item/completed", data: { item: { type } } })),
);
const items = fc.array(item, { maxLength: 24 });

// ---- Oracles: the specification restated independently of server.ts ------------------
function expectedShare(rows) {
  const t = rows[0]?.type === "thread/tokenUsage/updated" ? rows[0].data.tokenUsage.total : undefined;
  if (!t) return null;
  const input = t.totalTokens - t.outputTokens;
  const reads = t.cacheReadInputTokens !== undefined ? t.cacheReadInputTokens : t.cachedInputTokens - (t.cacheWriteInputTokens ?? 0);
  return input > 0 && reads >= 0 && reads <= input ? reads / input : null;
}
function expectedTools(rows) {
  if (rows.length === 0) return null;
  const calls = rows.filter(r => r.type === "item/started" && toolKinds.includes(r.data.item.type)).length;
  return Math.min(1, calls / 12);
}

export function properties(mod) {
  return [
    ["output matches the RPC contract and leaks nothing else", fc.asyncProperty(usageRows, items, async (usage, its) => {
      const { result } = await callServer(mod, { usage, items: its });
      assert.deepEqual(Object.keys(result).sort(), ["cacheReadShare", "toolActivity"]);
      const parsed = mod.contract.meadow_activity.output.safeParse(result);
      assert.ok(parsed.success, `output violates the contract: ${JSON.stringify(result)}`);
    })],
    ["cacheReadShare equals the oracle", fc.asyncProperty(usageRows, async usage => {
      const { result } = await callServer(mod, { usage, items: [] });
      assert.equal(result.cacheReadShare, expectedShare(usage));
    })],
    ["toolActivity equals the oracle", fc.asyncProperty(items, async its => {
      const { result } = await callServer(mod, { usage: [], items: its });
      assert.equal(result.toolActivity, expectedTools(its));
    })],
    ["share is invariant to scaling all token counts", fc.asyncProperty(usageRow, fc.integer({ min: 2, max: 50 }), async (row, k) => {
      const t = row.data.tokenUsage.total;
      const scaled = Object.fromEntries(Object.entries(t).map(([key, v]) => [key, v === undefined ? v : v * k]));
      const a = await callServer(mod, { usage: [row], items: [] });
      const b = await callServer(mod, { usage: [{ ...row, data: { tokenUsage: { total: scaled, last: scaled } } }], items: [] });
      if (a.result.cacheReadShare === null) assert.equal(b.result.cacheReadShare, null);
      else assert.ok(Math.abs(a.result.cacheReadShare - b.result.cacheReadShare) < 1e-12);
    })],
    ["one more tool call never lowers toolActivity; order is irrelevant", fc.asyncProperty(items, fc.constantFrom(...toolKinds), async (its, kind) => {
      const activity = async rows => (await callServer(mod, { usage: [], items: rows })).result.toolActivity;
      const base = await activity(its);
      assert.ok(await activity([...its, { type: "item/started", data: { item: { type: kind } } }]) >= (base ?? 0));
      assert.equal(await activity([...its].reverse()), base);
    })],
    ["queries are bounded: latest usage row and the last 24 items of this thread", fc.asyncProperty(fc.string({ minLength: 1 }), async threadId => {
      const { queries } = await callServer(mod, { usage: [], items: [], threadId });
      assert.deepEqual(queries, [
        { threadId, types: ["thread/tokenUsage/updated"], order: "desc", limit: "1" },
        { threadId, types: ["item/started"], order: "desc", limit: "24" },
      ]);
    })],
  ];
}

async function check(mod) {
  for (const [name, property] of properties(mod)) {
    try { await fc.assert(property, { seed, numRuns }); }
    catch (error) { error.property = name; throw error; }
  }
}

// ---- Run ---------------------------------------------------------------------------------
let failed = false;
const original = await import(serverUrl);
try {
  await check(original);
  console.log(`properties: ${properties(original).length} passed (${numRuns} runs each, seed ${seed})`);
} catch (error) {
  failed = true;
  console.log(`properties: FAILED "${error.property}"\n${error.message}`);
}
mkdirSync(`${root}coverage/server`, { recursive: true });
writeFileSync(`${root}coverage/server/coverage-final.json`, JSON.stringify(globalThis.__coverage__ ?? {}));

let killed = 0;
for (const [i, [description]] of mutants.entries()) {
  let verdict;
  try {
    await check(await import(`${serverUrl}?mutant=${i}`));
    verdict = "SURVIVED";
  } catch (error) {
    const cause = error.cause ?? error;
    verdict = cause instanceof assert.AssertionError ? `killed by assertion in "${error.property}"`
      : `ERROR ${cause.constructor?.name}: ${cause.message.split("\n")[0]}`;
  }
  if (verdict.startsWith("killed")) killed++;
  else failed = true;
  console.log(`mutant ${String(i + 1).padStart(2)} ${description}: ${verdict}`);
}
console.log(`mutation: ${killed}/${mutants.length} killed by assertions`);
process.exit(failed ? 1 : 0);
