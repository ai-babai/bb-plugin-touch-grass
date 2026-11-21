// Fake BB host for the browser harness. Only the host side is faked: the plugin uses the
// real @get-bb/plugin-sdk packages, which look the runtime up on globalThis.__bbPluginRuntime.
// One in-memory event log per thread serves both the browser front (useSdk) and the
// server plugin (bb.sdk), like the real BB thread history.
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";

type Row = { type: string; data: unknown };
type Query = { threadId: string; types: string[]; order?: "asc" | "desc"; limit?: string; signal?: AbortSignal };
type Change = { threadId: string; changes: string[]; metadata?: { eventTypes?: string[] } };
type Listener = { event: string; threadId?: string; callback(payload: unknown): void };
type Schema = { parse(value: unknown): unknown };
type Contract = Record<string, { input: Schema; output: Schema }>;
type Handlers = Record<string, (input: unknown) => Promise<unknown>>;
export type Seed = { threads?: Record<string, Row[]>; scope?: { kind: string; threadId?: string } };

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const later = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function createHost(seed: Seed) {
  const threads = new Map(Object.entries(seed.threads ?? {}));
  const listeners = new Set<Listener>();
  const calls: { side: string; method: string; input: unknown }[] = [];
  const failures = { list: 0, rpc: 0 };
  let scope = seed.scope ?? { kind: "thread", threadId: Object.keys(seed.threads ?? {})[0] ?? "thr_meadow" };
  const scopeWatchers = new Set<() => void>();
  let server: { contract: Contract; handlers: Handlers } | undefined;

  const list = (side: string) => async (query: Query) => {
    const { signal, ...logged } = query;
    calls.push({ side, method: "threads.events.list", input: wire(logged) });
    await later(4);
    if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
    if (failures.list > 0 && failures.list--) throw new Error("history service unavailable");
    const rows = (threads.get(query.threadId) ?? [])
      .map((row, i) => ({ ...row, seq: i + 1, threadId: query.threadId }))
      .filter(row => query.types.includes(row.type));
    if (query.order === "desc") rows.reverse();
    return wire(rows.slice(0, Number(query.limit ?? 100)));
  };

  const frontSdk = {
    threads: { events: { list: list("front") } },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  // The server sees exactly the read API it needs; any other call fails loudly.
  const serverApi = {
    sdk: Object.freeze({ threads: Object.freeze({ events: Object.freeze({ list: list("server") }) }) }),
    rpc: { register(contract: Contract, handlers: Handlers) { server = { contract, handlers }; } },
  };

  const rpc = {
    async call(method: string, input: unknown) {
      calls.push({ side: "front", method: `rpc.${method}`, input: wire(input) });
      await later(6);
      if (!server?.handlers[method]) throw new Error(`unknown_method: ${method}`);
      if (failures.rpc > 0 && failures.rpc--) throw new Error("transport_error");
      const parsed = server.contract[method].input.parse(wire(input));
      return wire(server.contract[method].output.parse(await server.handlers[method](parsed)));
    },
  };

  const useComposer = () => {
    const current = React.useSyncExternalStore(notify => {
      scopeWatchers.add(notify);
      return () => scopeWatchers.delete(notify);
    }, () => scope);
    return { scope: current };
  };

  (globalThis as Record<string, unknown>).__bbPluginRuntime = {
    react: React,
    jsxRuntime,
    pluginSdkApp: { useSdk: () => frontSdk, useRpc: () => rpc, useComposer },
  };

  // Test controls, exposed on window.bb by the page.
  return {
    serverApi,
    calls,
    failures,
    rpc: (method: string, input: unknown) => rpc.call(method, input),
    rows: (threadId: string) => threads.get(threadId) ?? [],
    append(threadId: string, rows: Row[], changes = ["events-appended"]) {
      threads.set(threadId, [...(threads.get(threadId) ?? []), ...rows]);
      this.changed({ threadId, changes, metadata: { eventTypes: [...new Set(rows.map(r => r.type))] } });
    },
    replace(threadId: string, rows: Row[]) {
      threads.set(threadId, rows);
      this.changed({ threadId, changes: ["history-rewritten"] });
    },
    changed(change: Change) {
      for (const l of [...listeners]) if (l.event === "thread:changed" && l.threadId === change.threadId) l.callback(change);
    },
    reconnected() {
      for (const l of [...listeners]) if (l.event === "realtime:connection") l.callback({ connected: true, reconnected: true });
    },
    listeners: () => [...listeners].map(l => `${l.event}:${l.threadId ?? "*"}`),
    setScope(next: typeof scope) {
      scope = next;
      for (const notify of scopeWatchers) notify();
    },
  };
}
