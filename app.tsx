import { changedActivity } from "./activity-events";
import { useEffect, useState } from "react";
import { definePluginApp, useComposer, useSdk } from "@get-bb/plugin-sdk/app";
import { Grass } from "./Grass";
import { useMeadowActivity } from "./useMeadowActivity";

// One bounded BB query can return up to 100 events across both event types.
const matureAt = 50;

function ThreadMeadow({ threadId }: { threadId: string }) {
  const sdk = useSdk();
  const activity = useMeadowActivity(threadId);
  const [growth, setGrowth] = useState<number | null>(null);

  useEffect(() => {
    let request: AbortController | undefined;
    async function refresh() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const events = await sdk.threads.events.list({
          threadId,
          types: ["turn/started", "turn/input/accepted"],
          limit: String(2 * matureAt),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          // Accepted inputs include steering during a turn. Older providers may
          // only record starts. Taking the larger count avoids counting both.
          const starts = events.filter(event => event.type === "turn/started").length;
          const inputs = events.length - starts;
          const steps = Math.min(matureAt, Math.max(starts, inputs));
          setGrowth(Math.log1p(steps / 5) / Math.log1p(matureAt / 5));
        }
      } catch (error) {
        if (!controller.signal.aborted) console.warn("[touch-grass] История ходов недоступна", error);
      }
    }
    const unsubscribe = sdk.subscribe({
      event: "thread:changed",
      threadId,
      callback(change) {
        if (changedActivity(change, ["turn/started", "turn/input/accepted"])) void refresh();
      },
    });
    const reconnect = sdk.subscribe({
      event: "realtime:connection",
      callback(connection) {
        if (connection.reconnected) void refresh();
      },
    });
    void refresh();
    return () => {
      unsubscribe();
      reconnect();
      request?.abort();
    };
  }, [sdk, threadId]);

  return growth === null ? null : <Grass threadId={threadId} growth={growth} {...activity} />;
}

function MeadowBanner() {
  const { scope } = useComposer();
  return scope.kind === "thread" ? <ThreadMeadow key={scope.threadId} threadId={scope.threadId} /> : null;
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "thread-meadow",
    scopes: ["thread"],
    banners: [{ id: "grass", chrome: "bare", component: MeadowBanner }],
  });
});
