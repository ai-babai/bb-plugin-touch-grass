// Each visible chat gets one deadline. Returning to an overdue meadow adds one plant.
const FIRST_BLOOM_MS = 15_000;
const BLOOM_INTERVAL_MS = 120_000;

interface Habitat {
  threadId: string;
  open(): boolean;
  hasRoom(): boolean;
  spots(): number[];
  bloom(at: number): void;
}

export function openSpot(spots: number[], left: number, right: number) {
  const edges = [left, ...spots.filter(x => x > left && x < right).sort((a, b) => a - b), right];
  let start = left;
  let gap = 0;
  for (let i = 1; i < edges.length; i++) {
    const space = edges[i] - edges[i - 1];
    if (space > gap) { start = edges[i - 1]; gap = space; }
  }
  return start + gap * (0.2 + 0.6 * Math.random());
}

export function createNaturalBloom(host: Habitat) {
  const key = `bb-touch-grass:bloom:${host.threadId}`;
  let timer = 0;
  function readDeadline() {
    try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
  }
  function remember(after: number) {
    const time = Date.now() + after;
    try { localStorage.setItem(key, String(time)); } catch { /* This chat can still bloom for the session. */ }
    return time;
  }
  let due = readDeadline() || remember(host.spots().length ? BLOOM_INTERVAL_MS : FIRST_BLOOM_MS);

  function check() {
    clearTimeout(timer);
    if (!host.open() || !host.hasRoom()) return;
    due = Math.max(due, readDeadline());
    timer = window.setTimeout(bloom, Math.max(0, due - Date.now()));
  }
  function bloom() {
    if (!host.open() || !host.hasRoom()) return;
    due = Math.max(due, readDeadline());
    if (Date.now() >= due) {
      due = remember(BLOOM_INTERVAL_MS);
      host.bloom(openSpot(host.spots(), 0.08, 0.92));
    }
    check();
  }
  return {
    check,
    restart() { due = remember(BLOOM_INTERVAL_MS); check(); },
    dispose() { clearTimeout(timer); },
  };
}
