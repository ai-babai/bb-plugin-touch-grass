import { useEffect, useRef } from "react";
import "./grass.css";

/**
 * Полоска травы над полем ввода чата.
 * growth (0..1) задаётся снаружи: 0 — редкие ростки, 1 — густой луг.
 * Рисунок детерминирован по threadId, курсор пригибает стебли без клика.
 *
 * Мини-игра «Светлячки»: в траве спит светлячок. Если гладить траву над ним,
 * он разгорается, просыпается и улетает, а на его месте распускается цветок.
 * Цветы сохраняются по треду; места на клумбе прибавляется вместе с чатом.
 */

const CELL = 3; // шаг «мировой» сетки травинок, px — рисунок устойчив к ширине
const SPROUT_PX = 7; // высота ростков при growth = 0
const MEADOW_PX = 66; // высота луга при growth = 1
const REACH = 30; // радиус касания курсора, px
const STIFFNESS = 20; // упругость стебля
const DAMPING = 6.2; // демпфирование: мягкое плавное возвращение
const GROW_MS = 1400;

const FIREFLY_REACH = 40; // светлячок чувствует движение только рядом, px
const WAKE_AT = 320; // сколько «поглаженных» пикселей нужно, чтобы разбудить
const FADE_PER_S = 55; // без поглаживания светлячок снова засыпает
const BLOOM_MS = 800;
const FLY_MS = 1600;
const FIRST_FIREFLY_MS = 1800;

type Flower = { at: number; kind: number; born: number; bend: number; vel: number };

const FLOWER_KINDS = [
  { petal: "#f7f4ec", center: "#e7b52c", n: 9, long: 1.55, wide: 0.5 }, // ромашка
  { petal: "#5d82d8", center: "#2c3d78", n: 7, long: 1.35, wide: 0.55 }, // василёк
  { petal: "#d97ba7", center: "#b0557e", n: 10, long: 0.95, wide: 0.6 }, // клевер
  { petal: "#f3c531", center: "#c58b12", n: 5, long: 1.0, wide: 0.85 }, // лютик
];

function gardenCapacity(growth: number) {
  return 3 + Math.round(growth * 9);
}

function gardenKey(threadId: string) {
  return `bb-touch-grass:garden:${threadId}`;
}

function loadGarden(threadId: string, width: number): Flower[] {
  try {
    const raw = window.localStorage.getItem(gardenKey(threadId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.slice(0, gardenCapacity(1)).flatMap(f => {
      if (!f || !Number.isInteger(f.kind)) return [];
      // Earlier local installs saved the distance from the left edge in pixels.
      const at = f.at ?? f.x / Math.max(1, width);
      if (!Number.isFinite(at)) return [];
      return [{ at: Math.max(0.02, Math.min(0.98, at)), kind: Math.abs(f.kind) % FLOWER_KINDS.length, born: 0, bend: 0, vel: 0 }];
    });
  } catch {
    return [];
  }
}

function saveGarden(threadId: string, flowers: Flower[]) {
  try {
    window.localStorage.setItem(gardenKey(threadId), JSON.stringify(flowers.map(f => ({ at: f.at, kind: f.kind }))));
  } catch {
    // Хранилище недоступно — цветы проживут до закрытия чата.
  }
}

type Blade = {
  x: number;
  appear: number; // порог роста, при котором травинка появляется
  h: number; // доля полной высоты
  w: number; // ширина у основания, px
  lean: number; // собственный наклон, доля высоты
  pliancy: number; // податливость к касанию
  depth: number; // 0 — задний план, 1 — передний
  hue: number;
  sat: number;
  light: number;
  seed: boolean; // колосок
  bend: number;
  vel: number;
  fill: string;
  rib: string;
};

type Theme = "light" | "dark";

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

function meadowHeight(growth: number) {
  return SPROUT_PX + (MEADOW_PX - SPROUT_PX) * growth;
}

function boxHeight(growth: number) {
  return Math.max(18, Math.ceil(meadowHeight(growth) * 1.04 + 3)); // место для цветка в молодом луге
}

function colorFor(blade: Blade, theme: Theme): [string, string] {
  const dark = theme === "dark";
  // Задний план темнее и приглушённее — даёт глубину без фона.
  const depthShade = (blade.depth - 0.5) * (dark ? 10 : 12);
  const sat = blade.sat * (dark ? 0.82 : 1) * (0.75 + 0.25 * blade.depth);
  const light = blade.light + depthShade + (dark ? -2 : 0);
  const alpha = dark ? 0.78 + 0.22 * blade.depth : 0.85 + 0.15 * blade.depth;
  const fill = `hsla(${blade.hue.toFixed(1)}, ${sat.toFixed(1)}%, ${light.toFixed(1)}%, ${alpha.toFixed(2)})`;
  const rib = `hsla(${(blade.hue + 6).toFixed(1)}, ${(sat * 0.9).toFixed(1)}%, ${(light + (dark ? 14 : 16)).toFixed(1)}%, ${(0.35 * blade.depth).toFixed(2)})`;
  return [fill, rib];
}

function buildBlades(threadId: string, width: number, theme: Theme): Blade[] {
  const seed = hashString(threadId || "bb");
  const cells = Math.ceil(width / CELL) + 2;
  const blades: Blade[] = [];
  for (let cell = -1; cell < cells; cell++) {
    const rnd = cellRandom(seed, cell);
    // До трёх травинок на ячейку; у каждой свой порог появления.
    for (let k = 0; k < 3; k++) {
      const appear = rnd();
      const depth = rnd();
      const dry = rnd() < 0.06;
      const blade: Blade = {
        x: cell * CELL + rnd() * CELL,
        appear: appear * 0.55 + k * 0.15,
        h: 0,
        w: 1.3 + rnd() * 1.9 + depth * 0.8,
        lean: (rnd() - 0.5) * 0.45,
        pliancy: 0.7 + rnd() * 0.6,
        depth,
        hue: dry ? 48 + rnd() * 14 : 88 + rnd() * 42,
        sat: dry ? 30 + rnd() * 18 : 34 + rnd() * 26,
        light: dry ? 46 + rnd() * 10 : 28 + rnd() * 16,
        seed: rnd() < 0.05,
        bend: 0,
        vel: 0,
        fill: "",
        rib: "",
      };
      const tall = rnd();
      blade.h = 0.42 + 0.58 * Math.pow(tall, 0.7) * (0.75 + 0.25 * depth);
      [blade.fill, blade.rib] = colorFor(blade, theme);
      blades.push(blade);
    }
  }
  // Сначала задний план, затем передний.
  blades.sort((a, b) => a.depth - b.depth);
  return blades;
}

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

function detectTheme(el: HTMLElement): Theme {
  const style = getComputedStyle(el);
  const lum = parseLuminance(style.getPropertyValue("--background"));
  if (lum !== null) return lum < 0.5 ? "dark" : "light";
  const root = document.documentElement;
  if (root.classList.contains("dark") || root.dataset.theme === "dark") return "dark";
  if (root.classList.contains("light") || root.dataset.theme === "light") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function Grass({ threadId, growth }: { threadId: string; growth: number }) {
  const target = Number.isFinite(growth) ? Math.min(1, Math.max(0, growth)) : 0;
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(target);
  const engineRef = useRef<{ setGrowth(g: number): void } | null>(null);

  targetRef.current = target;

  useEffect(() => {
    engineRef.current?.setGrowth(target);
  }, [target]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!host || !canvas || !ctx) return;

    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let reduced = !!motionQuery?.matches;
    let theme: Theme = detectTheme(host);
    let width = 0;
    let height = 0;
    let dpr = 1;
    let blades: Blade[] = [];
    let shown = reduced ? targetRef.current : 0; // при открытии трава прорастает
    let growFrom = shown;
    let growTo = targetRef.current;
    let growStart = performance.now();
    let frame = 0;
    let lastTick = 0;
    let disposed = false;
    const pokes: { x: number; y: number; dx: number }[] = [];
    let lastPointer: { x: number; y: number; t: number } | null = null;
    let gamePointer: { x: number; t: number } | null = null;
    let flowers: Flower[] = loadGarden(threadId, host.clientWidth);
    let firefly: { x: number; energy: number; updated: number; waking: boolean } | null = null;
    let spawnTimer = 0;
    let wakeTimer = 0;
    let fadeTimer = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(0, Math.round(rect.width));
      const h = boxHeight(growTo);
      if (w === width && h === height && nextDpr === dpr && blades.length) return;
      const widthChanged = w !== width || !blades.length;
      width = w;
      height = h;
      dpr = nextDpr;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.height = `${height}px`;
      if (widthChanged) blades = buildBlades(threadId, width, theme);
      if (widthChanged && firefly && !firefly.waking) {
        firefly.x = Math.max(9, Math.min(width - 9, firefly.x));
      }
      if (widthChanged && width >= 60) queueFirefly(FIRST_FIREFLY_MS);
      draw();
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (!width) return;
      const full = meadowHeight(shown);
      const visibleUpTo = 0.08 + 0.92 * shown;
      const ground = height;
      const seedsVisible = shown > 0.55;
      let flowersDrawn = false;
      for (const b of blades) {
        if (!flowersDrawn && b.depth >= 0.5) {
          flowersDrawn = true;
          drawFlowers(full, ground);
        }
        const appear = b.appear;
        if (appear > visibleUpTo || b.x < -6 || b.x > width + 6) continue;
        // Только что появившиеся травинки мягко подрастают.
        const emerge = Math.min(1, (visibleUpTo - appear) / 0.12);
        const h = full * b.h * (0.35 + 0.65 * emerge);
        if (h < 1) continue;
        const w = b.w * (0.6 + 0.4 * Math.min(1, h / 24));
        const bend = Math.max(-1.15, Math.min(1.15, b.bend));
        const dx = (b.lean + bend * 0.8) * h;
        const ratio = Math.min(1, Math.abs(dx) / h);
        const tipX = b.x + dx;
        const tipY = ground - h * (1 - 0.32 * ratio * ratio);
        const cx = b.x + b.lean * h * 0.15 + bend * h * 0.18;
        const cy = ground - h * 0.55;
        ctx.beginPath();
        ctx.moveTo(b.x - w / 2, ground + 0.5);
        ctx.quadraticCurveTo(cx - w * 0.35, cy, tipX, tipY);
        ctx.quadraticCurveTo(cx + w * 0.35, cy, b.x + w / 2, ground + 0.5);
        ctx.closePath();
        ctx.fillStyle = b.fill;
        ctx.fill();
        if (b.depth > 0.6 && h > 14) {
          ctx.beginPath();
          ctx.moveTo(b.x, ground);
          ctx.quadraticCurveTo(cx, cy, tipX, tipY);
          ctx.strokeStyle = b.rib;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
        if (b.seed && seedsVisible && h > 26) {
          ctx.save();
          ctx.translate(tipX, tipY + 2);
          ctx.rotate(Math.atan2(dx, h) * 0.9);
          ctx.beginPath();
          ctx.ellipse(0, 0, 1.4, 3.6, 0, 0, Math.PI * 2);
          ctx.fillStyle = b.fill;
          ctx.fill();
          ctx.restore();
        }
      }
      if (!flowersDrawn) drawFlowers(full, ground);
      placeFirefly(full);
    };

    const drawFlowers = (full: number, ground: number) => {
      if (!flowers.length) return;
      const now = performance.now();
      const dark = theme === "dark";
      for (const f of flowers) {
        const x = f.at * width;
        const bloom = f.born ? Math.min(1, (now - f.born) / BLOOM_MS) : 1;
        const open = 1 - Math.pow(1 - bloom, 3);
        const stem = Math.max(10, full * 0.6) * (0.45 + 0.55 * open);
        const bend = Math.max(-1, Math.min(1, f.bend));
        const headX = x + bend * stem * 0.5;
        const headY = ground - stem * (1 - 0.15 * bend * bend);
        ctx.beginPath();
        ctx.moveTo(x, ground + 0.5);
        ctx.quadraticCurveTo(x + bend * stem * 0.1, ground - stem * 0.5, headX, headY);
        ctx.strokeStyle = dark ? "hsla(105, 32%, 38%, 0.9)" : "hsla(105, 38%, 34%, 0.95)";
        ctx.lineWidth = 1.1;
        ctx.stroke();
        const kind = FLOWER_KINDS[f.kind];
        const r = (2.7 + 1.9 * shown) * open;
        if (r < 0.3) continue;
        ctx.save();
        ctx.translate(headX, headY);
        ctx.rotate(bend * 0.6 + x * 0.37);
        ctx.globalAlpha = dark ? 0.9 : 1;
        ctx.fillStyle = kind.petal;
        for (let i = 0; i < kind.n; i++) {
          ctx.rotate((Math.PI * 2) / kind.n);
          ctx.beginPath();
          ctx.ellipse(0, -r * kind.long * 0.55, r * kind.wide * 0.55, r * kind.long * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = kind.center;
        ctx.fill();
        ctx.restore();
      }
    };

    // --- Светлячок -------------------------------------------------------
    const flyEl = document.createElement("div");
    flyEl.className = "tg-firefly";
    flyEl.innerHTML = '<div class="tg-firefly-pulse"><div class="tg-firefly-glow"></div></div>';
    host.appendChild(flyEl);

    const placeFirefly = (full: number) => {
      if (!firefly) return;
      const left = `${firefly.x.toFixed(1)}px`;
      const bottom = `${(2 + Math.min(full * 0.32, 14)).toFixed(1)}px`;
      if (flyEl.style.left !== left) flyEl.style.left = left;
      if (flyEl.style.bottom !== bottom) flyEl.style.bottom = bottom;
    };

    const showEnergy = () => {
      const e = firefly ? Math.min(1, firefly.energy / WAKE_AT) : 0;
      flyEl.style.setProperty("--e", e.toFixed(3));
    };

    const decay = (now: number) => {
      if (!firefly || firefly.waking) return;
      firefly.energy = Math.max(0, firefly.energy - (FADE_PER_S * (now - firefly.updated)) / 1000);
      firefly.updated = now;
    };

    const stopFade = () => {
      if (fadeTimer) window.clearInterval(fadeTimer);
      fadeTimer = 0;
    };

    const spawnFirefly = () => {
      spawnTimer = 0;
      if (disposed || firefly || width < 60 || flowers.length >= gardenCapacity(growTo)) return;
      // Pick a spot in the widest open stretch, even on a narrow split pane.
      const positions = [0, ...flowers.map(f => f.at), 1].sort((a, b) => a - b);
      let gap = 0;
      let left = 0;
      for (let i = 1; i < positions.length; i++) {
        const size = positions[i] - positions[i - 1];
        if (size > gap) { gap = size; left = positions[i - 1]; }
      }
      const x = Math.max(9, Math.min(width - 9, width * (left + gap * (0.2 + 0.6 * Math.random()))));
      firefly = { x, energy: 0, updated: performance.now(), waking: false };
      flyEl.classList.remove("is-waking");
      showEnergy();
      placeFirefly(meadowHeight(shown));
      flyEl.classList.add("is-on");
    };

    const queueFirefly = (delay: number) => {
      if (disposed || firefly || spawnTimer) return;
      spawnTimer = window.setTimeout(spawnFirefly, delay);
    };

    const wake = () => {
      if (!firefly) return;
      const fly = firefly;
      fly.waking = true;
      fly.energy = WAKE_AT;
      stopFade();
      showEnergy();
      flyEl.classList.add("is-waking");
      const flower: Flower = {
        at: fly.x / width,
        kind: Math.floor(Math.random() * FLOWER_KINDS.length),
        born: reduced ? 0 : performance.now(),
        bend: 0,
        vel: 0,
      };
      flowers.push(flower);
      saveGarden(threadId, flowers);
      if (!reduced) {
        // Трава расступается от вспышки.
        for (const b of blades) {
          const d = b.x - fly.x;
          if (Math.abs(d) > 60) continue;
          b.vel += Math.sign(d || 1) * 3.2 * Math.exp(-((d / 60) ** 2) * 2) * b.pliancy;
        }
      }
      draw();
      schedule();
      wakeTimer = window.setTimeout(() => {
        wakeTimer = 0;
        firefly = null;
        flyEl.classList.remove("is-on", "is-waking");
        showEnergy();
        queueFirefly(3500 + Math.random() * 3000);
      }, reduced ? 900 : FLY_MS);
    };

    const feedFirefly = (px: number, dx: number, now: number) => {
      if (!firefly || firefly.waking) return;
      const d = Math.abs(px - firefly.x);
      if (d > FIREFLY_REACH) return;
      decay(now);
      firefly.energy += Math.min(40, Math.abs(dx)) * (1 - d / FIREFLY_REACH);
      showEnergy();
      if (firefly.energy >= WAKE_AT) {
        wake();
        return;
      }
      if (!fadeTimer) {
        fadeTimer = window.setInterval(() => {
          decay(performance.now());
          showEnergy();
          if (!firefly || firefly.waking || firefly.energy <= 0) stopFade();
        }, 200);
      }
    };

    const applyPokes = () => {
      if (!pokes.length) return;
      const rect = canvas.getBoundingClientRect();
      const full = meadowHeight(shown);
      for (const p of pokes) {
        const px = p.x - rect.left;
        const py = p.y - rect.top;
        if (px < -REACH || px > width + REACH || py < -8 || py > height + 8) continue;
        const push = Math.max(-36, Math.min(36, p.dx));
        for (const b of blades) {
          const d = b.x - px;
          if (d < -REACH || d > REACH) continue;
          // Касаемся только если курсор ниже кончика травинки.
          const tip = height - full * b.h;
          if (py < tip - 6) continue;
          const falloff = Math.exp(-((d / REACH) * (d / REACH)) * 3);
          b.vel += push * 0.11 * falloff * b.pliancy;
        }
        for (const f of flowers) {
          const d = f.at * width - px;
          if (d < -REACH || d > REACH) continue;
          f.vel += push * 0.07 * Math.exp(-((d / REACH) * (d / REACH)) * 3);
        }
      }
      pokes.length = 0;
    };

    const tick = (now: number) => {
      frame = 0;
      if (disposed) return;
      const dt = Math.min(0.05, lastTick ? (now - lastTick) / 1000 : 1 / 60);
      lastTick = now;

      let active = false;
      if (shown !== growTo) {
        const t = reduced ? 1 : Math.min(1, (now - growStart) / GROW_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        shown = growFrom + (growTo - growFrom) * eased;
        if (t >= 1) shown = growTo;
        else active = true;
      }

      applyPokes();
      for (const b of blades) {
        if (b.bend === 0 && b.vel === 0) continue;
        const acc = -STIFFNESS * b.bend - DAMPING * b.vel;
        b.vel += acc * dt;
        b.bend += b.vel * dt;
        if (b.bend > 1.15) { b.bend = 1.15; b.vel = Math.min(0, b.vel); }
        if (b.bend < -1.15) { b.bend = -1.15; b.vel = Math.max(0, b.vel); }
        if (Math.abs(b.bend) < 0.0015 && Math.abs(b.vel) < 0.0015) {
          b.bend = 0;
          b.vel = 0;
        } else {
          active = true;
        }
      }

      for (const f of flowers) {
        if (f.born && now - f.born < BLOOM_MS) active = true;
        else f.born = 0;
        if (f.bend === 0 && f.vel === 0) continue;
        f.vel += (-STIFFNESS * f.bend - DAMPING * f.vel) * dt;
        f.bend += f.vel * dt;
        if (Math.abs(f.bend) < 0.0015 && Math.abs(f.vel) < 0.0015) {
          f.bend = 0;
          f.vel = 0;
        } else {
          active = true;
        }
      }

      draw();
      if (active) schedule();
      else lastTick = 0; // покой: ни одного кадра, пока ничего не меняется
    };

    const schedule = () => {
      if (!frame && !disposed && document.visibilityState !== "hidden") {
        frame = requestAnimationFrame(tick);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      // Игра: светлячок разгорается только от движения прямо над ним.
      const moved = event.timeStamp || performance.now();
      if (firefly && !firefly.waking) {
        const prevGame = gamePointer;
        gamePointer = { x: event.clientX, t: moved };
        if (prevGame && moved - prevGame.t <= 120) {
          const left = host.getBoundingClientRect().left;
          feedFirefly(event.clientX - left, event.clientX - prevGame.x, performance.now());
        }
      } else {
        gamePointer = null;
      }
      if (reduced) {
        // A stationary bend under the pointer gives feedback without swaying.
        const rect = canvas.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const full = meadowHeight(shown);
        for (const blade of blades) {
          const distance = blade.x - px;
          const weight = Math.max(0, 1 - Math.abs(distance) / REACH);
          blade.bend = py >= height - full * blade.h - 6 ? Math.sign(distance) * weight * 0.65 : 0;
        }
        draw();
        return;
      }
      const now = event.timeStamp || performance.now();
      const prev = lastPointer;
      lastPointer = { x: event.clientX, y: event.clientY, t: now };
      if (!prev || now - prev.t > 120) return;
      const dx = event.clientX - prev.x;
      if (Math.abs(dx) < 0.5) return;
      // Дешёвая отсечка до чтения геометрии — в кадре.
      if (pokes.length < 12) pokes.push({ x: event.clientX, y: event.clientY, dx });
      schedule();
    };

    const onPointerLeave = () => {
      lastPointer = null;
      gamePointer = null;
      if (reduced) {
        for (const blade of blades) blade.bend = 0;
        draw();
      }
    };

    const refreshTheme = () => {
      const next = detectTheme(host);
      if (next === theme) return;
      theme = next;
      for (const b of blades) [b.fill, b.rib] = colorFor(b, theme);
      draw();
    };

    const onMotionChange = () => {
      reduced = !!motionQuery?.matches;
      if (reduced) {
        for (const b of blades) { b.bend = 0; b.vel = 0; }
        for (const f of flowers) { f.bend = 0; f.vel = 0; f.born = 0; }
        shown = growTo;
        pokes.length = 0;
        draw();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        lastTick = 0;
      } else {
        schedule();
      }
    };

    engineRef.current = {
      setGrowth(g: number) {
        if (g === growTo) return;
        growFrom = shown;
        growTo = g;
        growStart = performance.now();
        resize();
        schedule();
        queueFirefly(1200); // в подросшем луге появилось место для цветка
      },
    };

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(host);
    const themeObserver = new MutationObserver(refreshTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    const schemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    schemeQuery?.addEventListener?.("change", refreshTheme);
    motionQuery?.addEventListener?.("change", onMotionChange);
    host.addEventListener("pointermove", onPointerMove, { passive: true });
    host.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);

    resize();
    schedule();
    queueFirefly(FIRST_FIREFLY_MS);

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      engineRef.current = null;
      resizeObserver.disconnect();
      themeObserver.disconnect();
      schemeQuery?.removeEventListener?.("change", refreshTheme);
      motionQuery?.removeEventListener?.("change", onMotionChange);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      if (spawnTimer) window.clearTimeout(spawnTimer);
      if (wakeTimer) window.clearTimeout(wakeTimer);
      stopFade();
      flyEl.remove();
      firefly = null;
      flowers = [];
      blades = [];
      pokes.length = 0;
      canvas.width = canvas.height = 0; // освобождаем буфер холста
    };
  }, [threadId]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label="Луг этого чата. Погладь огонёк туда-сюда, чтобы вырастить цветок."
      title="Погладь огонёк туда-сюда, чтобы вырастить цветок"
      style={{
        position: "relative",
        width: "100%",
        height: boxHeight(target),
        background: "transparent",
        pointerEvents: "auto",
        userSelect: "none",
        overflow: "visible", // улетающий светлячок может выйти за полосу, указатель он не ловит
        contain: "size layout style",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", left: 0, bottom: 0, width: "100%", display: "block" }}
      />
    </div>
  );
}
