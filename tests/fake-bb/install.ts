import { createHost, type Seed } from "./host";

// Installed before the plugin modules are evaluated (imported first by page.tsx).
const seed = (window as unknown as { __seed?: Seed & { background?: string | null } }).__seed ?? {};
if (seed.background !== null) {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.style.setProperty("--background", seed.background ?? (dark ? "#151815" : "#ffffff"));
}
export const host = createHost(seed);
