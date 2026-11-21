import type { Theme } from "./blades";

function parseLuminance(color: string): number | null {
  if (!color.trim()) return null;
  try {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = "#808081";
    ctx.fillStyle = color.trim();
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a < 8) return null;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  } catch {
    return null;
  }
}

export function detectTheme(el: HTMLElement): Theme {
  const style = getComputedStyle(el);
  const lum = parseLuminance(style.getPropertyValue("--background"));
  if (lum !== null) return lum < 0.5 ? "dark" : "light";
  const root = document.documentElement;
  if (root.classList.contains("dark") || root.dataset.theme === "dark") return "dark";
  if (root.classList.contains("light") || root.dataset.theme === "light") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
