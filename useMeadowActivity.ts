import { changedActivity } from "./activity-events";
import { useEffect, useState } from "react";
import { useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import type { contract } from "./server";

type Activity = { cacheReadShare?: number; toolActivity?: number };

export function useMeadowActivity(threadId: string): Activity {
  const sdk = useSdk();
  const rpc = useRpc<typeof contract>();
  const [activity, setActivity] = useState<Activity>({});

  useEffect(() => {
    let disposed = false;
    let fetching = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // A streaming agent may emit many events in one second. Coalesce them and
    // keep at most one request in flight for this visible meadow.
    function schedule() {
      dirty = true;
      if (!disposed && !fetching && timer === undefined && !document.hidden) {
        timer = setTimeout(refresh, 1200);
      }
    }
    async function refresh() {
      timer = undefined;
      if (document.hidden) { dirty = true; return; }
      dirty = false;
      fetching = true;
      try {
        const result = await rpc.call("meadow_activity", { threadId });
        if (!disposed) setActivity({
          cacheReadShare: result.cacheReadShare ?? undefined,
          toolActivity: result.toolActivity ?? undefined,
        });
      } catch (error) {
        if (!disposed) console.warn("[touch-grass] Не удалось обновить статистику луга", error);
      } finally {
        fetching = false;
        if (dirty && !disposed) schedule();
      }
    }
    const unsubscribe = sdk.subscribe({
      event: "thread:changed", threadId,
      callback(change) {
        if (changedActivity(change, ["item/started", "thread/tokenUsage/updated"])) schedule();
      },
    });
    const reconnect = sdk.subscribe({
      event: "realtime:connection",
      callback(connection) { if (connection.reconnected) schedule(); },
    });
    function onVisibility() {
      if (!document.hidden && dirty) schedule();
    }
    document.addEventListener("visibilitychange", onVisibility);
    void refresh();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(timer);
      unsubscribe();
      reconnect();
    };
  }, [threadId, sdk, rpc]);

  return activity;
}
