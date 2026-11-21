// Read-only server RPC on fake Claude and Codex usage, and how the front shows it.
import assert from "node:assert/strict";
import { THREAD, tool, turns, usage, withMeadow } from "../harness/meadow.mjs";

// Same session in two provider dialects: 8000 input tokens, 6000 of them read from cache.
const claude = usage({ totalTokens: 10_000, outputTokens: 2000, inputTokens: 1000, cachedInputTokens: 0, cacheReadInputTokens: 6000, cacheWriteInputTokens: 1000 });
const codex = usage({ totalTokens: 10_000, outputTokens: 2000, inputTokens: 8000, cachedInputTokens: 6000 });
const uncached = usage({ totalTokens: 10_000, outputTokens: 2000, inputTokens: 8000, cachedInputTokens: 0 });
const allCached = usage({ totalTokens: 10_000, outputTokens: 2000, inputTokens: 0, cachedInputTokens: 0, cacheReadInputTokens: 8000 });
const broken = usage({ totalTokens: 100, outputTokens: 2000, inputTokens: 0, cachedInputTokens: 50 });
const work = [...Array.from({ length: 6 }, (_, i) => tool(["commandExecution", "fileChange", "webSearch"][i % 3])),
  ...Array.from({ length: 18 }, () => ({ type: "item/started", data: { item: { type: "agentMessage", text: "secret plan" } } }))];
const activity = (m, threadId = THREAD) => m.bb(id => window.bb.rpc("meadow_activity", { threadId: id }), threadId);
const rpcCalls = m => m.calls("rpc.meadow_activity").then(c => c.length);

export default [
  ["meadow_activity reports cache reads and tool activity for Claude and Codex, nothing else", ctx => withMeadow(ctx, {
    threads: {
      [THREAD]: [...turns(3), uncached, ...work, claude],
      thr_codex: [codex, ...work.slice(0, 3)],
      thr_quiet: [broken],
      thr_cached: [allCached, ...work.slice(6)],
    },
  }, async m => {
    const claudeResult = await activity(m);
    assert.deepEqual(claudeResult, { cacheReadShare: 0.75, toolActivity: 0.5 }, "latest usage, 6 tool calls of the last 24 items");
    assert.ok(!JSON.stringify(claudeResult).includes("secret"));
    assert.deepEqual(await activity(m, "thr_codex"), { cacheReadShare: 0.75, toolActivity: 0.25 });
    assert.deepEqual(await activity(m, "thr_quiet"), { cacheReadShare: null, toolActivity: null }, "inconsistent usage, no items");
    assert.deepEqual(await activity(m, "thr_cached"), { cacheReadShare: 1, toolActivity: 0 });
    await assert.rejects(m.bb(() => window.bb.rpc("meadow_activity", { threadId: "" })), "the contract rejects an empty thread id");
    const server = await m.bb(() => window.bb.calls.filter(c => c.side === "server"));
    assert.ok(server.length >= 8 && server.every(c => c.method === "threads.events.list"), "the server only reads thread events");
    assert.deepEqual(server.slice(0, 2).map(c => c.input), [
      { threadId: THREAD, types: ["thread/tokenUsage/updated"], order: "desc", limit: "1" },
      { threadId: THREAD, types: ["item/started"], order: "desc", limit: "24" },
    ]);
  })],

  ["a well-cached chat shows a lusher meadow than an uncached one", async ctx => {
    const green = {};
    for (const [name, rows] of [["uncached", [uncached]], ["cached", [allCached]], ["unknown", []]]) {
      await withMeadow(ctx, { rows: [...turns(30), ...rows], reducedMotion: "reduce" }, async m => {
        await m.run(2000);
        green[name] = await m.greenness();
      });
    }
    assert.ok(green.cached > green.uncached + 4, JSON.stringify(green));
    assert.ok(green.unknown > green.uncached && green.unknown < green.cached, "no data: the base meadow");
  }],

  ["live usage updates are coalesced, repaint the meadow, and wait for a visible tab", ctx => withMeadow(ctx, {
    rows: [...turns(30), uncached], reducedMotion: "reduce",
  }, async m => {
    await m.run(2000);
    const dry = await m.greenness();
    const first = await rpcCalls(m);
    for (let i = 0; i < 5; i++) await m.bb(([id, row]) => window.bb.append(id, [row]), [THREAD, allCached]);
    await m.run(100);
    assert.equal(await rpcCalls(m), first, "a burst waits for the quiet period");
    await m.run(2000);
    assert.equal(await rpcCalls(m), first + 1, "one request for the whole burst");
    assert.ok(await m.greenness() > dry + 4, "the meadow turns lush without a reload");

    await m.bb(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await m.bb(([id, row]) => window.bb.append(id, [row]), [THREAD, tool("toolCall")]);
    await m.bb(id => window.bb.changed({ threadId: id, changes: ["status-changed"] }), THREAD);
    await m.run(5000);
    assert.equal(await rpcCalls(m), first + 1, "a hidden meadow does not ask");
    await m.bb(() => {
      delete document.hidden;
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await m.run(1500);
    assert.equal(await rpcCalls(m), first + 2, "it catches up when shown");
    await m.bb(() => window.bb.reconnected());
    await m.bb(id => window.bb.changed({ threadId: id, changes: ["events-appended"], metadata: { eventTypes: ["turn/completed"] } }), THREAD);
    await m.run(1500);
    assert.equal(await rpcCalls(m), first + 3, "reconnect refreshes, unrelated events do not");
  })],

  ["a failing RPC keeps the meadow and retries on the next change", ctx => withMeadow(ctx, { rows: [...turns(30), allCached] }, async m => {
    const calls = await rpcCalls(m);
    await m.bb(() => { window.bb.failures.rpc = 1; });
    await m.bb(id => window.bb.replace(id, [...window.bb.rows(id)]), THREAD);
    await m.run(1500);
    assert.ok(m.console.some(line => line.startsWith("warning") && line.includes("Не удалось обновить статистику луга")), m.console.join("\n"));
    assert.ok(await m.canvas.isVisible());
    await m.bb(id => window.bb.changed({ threadId: id, changes: ["history-compacted"] }), THREAD);
    await m.run(1500);
    assert.equal(await rpcCalls(m), calls + 2);
  })],
];
