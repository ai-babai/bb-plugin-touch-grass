type ThreadChange = {
  changes: readonly string[];
  metadata?: { eventTypes?: readonly string[] };
};

export function changedActivity(change: ThreadChange, relevant: readonly string[]) {
  if (change.changes.includes("history-rewritten") || change.changes.includes("history-compacted")) return true;
  const types = change.metadata?.eventTypes;
  if (!types) return change.changes.includes("status-changed");
  return relevant.some(type => types.includes(type));
}
