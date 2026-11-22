const CELL = 3; // шаг «мировой» сетки травинок, px — рисунок устойчив к ширине
const SPROUT_PX = 7; // высота ростков при growth = 0
const MEADOW_PX = 66; // высота луга при growth = 1
export type Blade = {
  x: number;
  appear: number; // порог роста, при котором травинка появляется
  h: number; // доля полной высоты
  w: number; // ширина у основания, px
  lean: number; // собственный наклон, доля высоты
  pliancy: number; // податливость к касанию
  depth: number; // 0 — задний план, 1 — передний
  dryRoll: number; // сухость решается при окраске, зависит от «полива»
  hueRoll: number;
  satRoll: number;
  lightRoll: number;
  seed: boolean; // колосок
  cutAt: number; // время покоса, 0 — не скошена
  cutTo?: number; // доля высоты сразу после покоса; по умолчанию — стерня
  wild?: number; // «Заросли»: доля полной высоты по часам луга (meadow-clock); cutAt тогда не используется
  bend: number;
  vel: number;
  fill: string;
  rib: string;
};

export type Theme = "light" | "dark";

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function cellRandom(seed: number, cell: number) {
  let s = (seed ^ Math.imul(cell + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function meadowHeight(growth: number, scale: number) {
  return SPROUT_PX + (MEADOW_PX * scale - SPROUT_PX) * growth;
}

export function boxHeight(growth: number, scale: number) {
  return Math.max(18, Math.ceil(meadowHeight(growth, scale) * 1.04 + 3)); // место для цветка в молодом луге
}

/**
 * lush — доля чтений из кеша (0..1): чем больше, тем сочнее и изумруднее трава,
 * чем меньше, тем больше выгоревших соломенных травинок. undefined — базовый вид.
 */
export function colorFor(blade: Blade, theme: Theme, lush: number | undefined): [string, string] {
  const dark = theme === "dark";
  const hsl = pigment(blade, lush);
  // Задний план темнее и приглушённее — даёт глубину без фона.
  const depthShade = (blade.depth - 0.5) * (dark ? 10 : 12);
  const sat = hsl.sat * (dark ? 0.82 : 1) * (0.75 + 0.25 * blade.depth);
  const light = hsl.light + depthShade + (dark ? -2 : 0);
  const alpha = dark ? 0.78 + 0.22 * blade.depth : 0.85 + 0.15 * blade.depth;
  const fill = `hsla(${hsl.hue.toFixed(1)}, ${sat.toFixed(1)}%, ${light.toFixed(1)}%, ${alpha.toFixed(2)})`;
  const rib = `hsla(${(hsl.hue + 6).toFixed(1)}, ${(sat * 0.9).toFixed(1)}%, ${(light + (dark ? 14 : 16)).toFixed(1)}%, ${(0.35 * blade.depth).toFixed(2)})`;
  return [fill, rib];
}

export function buildBlades(threadId: string, width: number, theme: Theme, lush: number | undefined): Blade[] {
  const seed = hashString(threadId || "bb");
  const cells = Math.ceil(width / CELL) + 2;
  const blades: Blade[] = [];
  for (let cell = -1; cell < cells; cell++) {
    const rnd = cellRandom(seed, cell);
    // До трёх травинок на ячейку; у каждой свой порог появления.
    for (let k = 0; k < 3; k++) {
      const appear = rnd();
      const depth = rnd();
      const dryRoll = rnd();
      const blade: Blade = {
        x: cell * CELL + rnd() * CELL,
        appear: appear * 0.55 + k * 0.15,
        h: 0,
        w: 1.3 + rnd() * 1.9 + depth * 0.8,
        lean: (rnd() - 0.5) * 0.45,
        pliancy: 0.7 + rnd() * 0.6,
        depth,
        dryRoll,
        hueRoll: rnd(),
        satRoll: rnd(),
        lightRoll: rnd(),
        seed: rnd() < 0.05,
        cutAt: 0,
        bend: 0,
        vel: 0,
        fill: "",
        rib: "",
      };
      const tall = rnd();
      blade.h = 0.42 + 0.58 * Math.pow(tall, 0.7) * (0.75 + 0.25 * depth);
      [blade.fill, blade.rib] = colorFor(blade, theme, lush);
      blades.push(blade);
    }
  }
  // Сначала задний план, затем передний.
  blades.sort((a, b) => a.depth - b.depth);
  return blades;
}

function pigment(blade: Blade, lush: number | undefined) {
  const dryShare = lush === undefined ? 0.06 : 0.02 + 0.2 * (1 - lush);
  const dry = blade.dryRoll < dryShare;
  const hueShift = lush === undefined ? 0 : (lush - 0.5) * 14;
  const satMul = lush === undefined ? 1 : 0.8 + 0.35 * lush;
  const hue = dry ? 48 + blade.hueRoll * 14 : 88 + blade.hueRoll * 42 + hueShift;
  const sat = (dry ? 30 + blade.satRoll * 18 : 34 + blade.satRoll * 26) * (dry ? 1 : satMul);
  const light = dry ? 46 + blade.lightRoll * 10 : 28 + blade.lightRoll * 16;
  return { hue: hue, sat: sat, light: light };
}
