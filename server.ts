import { type BbPluginApi, defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const activitySchema = z.object({
  cacheReadShare: z.number().min(0).max(1).nullable(),
  toolActivity: z.number().min(0).max(1).nullable(),
});

export const contract = defineRpcContract({
  meadow_activity: { input: z.object({ threadId: z.string().min(1) }), output: activitySchema },
});

const toolKinds = new Set([
  "commandExecution", "fileChange", "fileRead", "imageGeneration", "imageView",
  "search", "toolCall", "webFetch", "webSearch", "delegation",
]);

export default function activate(bb: BbPluginApi) {
  bb.rpc.register(contract, {
    async meadow_activity({ threadId }) {
      // Only the two normalized values leave the server. Items can contain tool arguments.
      const [usage, items] = await Promise.all([
        bb.sdk.threads.events.list({ threadId, types: ["thread/tokenUsage/updated"], order: "desc", limit: "1" }),
        bb.sdk.threads.events.list({ threadId, types: ["item/started"], order: "desc", limit: "24" }),
      ]);
      const latest = usage[0];
      const tokens = latest?.type === "thread/tokenUsage/updated" ? latest.data.tokenUsage.total : undefined;
      let cacheReadShare: number | null = null;
      if (tokens) {
        // Claude reports uncached input separately. Codex includes cached input in inputTokens.
        const allInput = tokens.totalTokens - tokens.outputTokens;
        const reads = tokens.cacheReadInputTokens ?? tokens.cachedInputTokens - (tokens.cacheWriteInputTokens ?? 0);
        if (allInput > 0 && reads >= 0 && reads <= allInput) cacheReadShare = reads / allInput;
      }
      const calls = items.filter(row => row.type === "item/started" && toolKinds.has(row.data.item.type)).length;
      return { cacheReadShare, toolActivity: items.length ? Math.min(1, calls / 12) : null };
    },
  });
}
