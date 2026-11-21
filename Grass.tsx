import { createFireflies } from "./fireflies";
import { type Blade, type Theme, boxHeight, buildBlades, colorFor, meadowHeight } from "./blades";
import { drawFlowers, type Flower, FLOWER_KINDS, loadGarden, ripenBerry, saveGarden } from "./garden";
import { advancePlants, brushPlants, leanAway, pressPlants, REACH } from "./meadow-physics";
import { detectTheme } from "./meadow-theme";
import { REGROW_MS, renderBlade, visibleShare } from "./draw-blade";
import { useEffect, useRef } from "react";
import "./grass.css";
import { createMowing } from "./mowing";
import { createVisitors, FIRST_VISITOR_MS } from "./meadow-visitors";
import { createPointerInput } from "./meadow-input";
import { type Guests, scaleFor } from "./meadow-prefs";
import { MeadowCard } from "./MeadowCard";
import { useMeadowCard } from "./useMeadowCard";

/**
 * Полоска травы над полем ввода чата.
 * growth (0..1) задаётся снаружи: 0 — редкие ростки, 1 — густой луг.
 * Рисунок детерминирован по threadId, курсор пригибает стебли без клика.
 *
 * Мини-игра «Светлячки»: в траве спит светлячок. Если гладить траву над ним,
 * он разгорается, просыпается и улетает, а на его месте распускается цветок.
 * Цветы сохраняются по треду; места на клумбе прибавляется вместе с чатом.
 *
 * Посетители: к цветам прилетает пчела, над лугом порхает бабочка; от курсора
 * они отлетают. «Газонокосилка» проезжает полосу, трава отрастает за минуту
 * и быстрее с каждым новым ходом. С «Косой» в руках траву косят сами.
 * Разметка и кнопки — MeadowCard, состояние — useMeadowCard, ввод — meadow-input,
 * предпочтения — meadow-prefs.
 */

const GROW_MS = 1400;

const FIRST_FIREFLY_MS = 1800;

const TURN_REGROW_BOOST = 0.35; // каждый новый ход ускоряет отрастание на треть

function unit(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined;
}

type Engine = {
  setGrowth(g: number): void;
  setScale(scale: number): void;
  setMetrics(lush: number | undefined, activity: number | undefined): void;
  mow(): void;
  setGuests(guests: Guests): void;
  setFlipped(flipped: boolean): void;
  setScythe(on: boolean): void;
};

export function Grass({
  threadId,
  growth,
  cacheReadShare,
  toolActivity,
}: {
  threadId: string;
  growth: number;
  /** Доля чтений из кеша, 0..1: окраска «полива». Без значения — базовый луг. */
  cacheReadShare?: number;
  /** Активность вызовов инструментов, 0..1: чаще и бойчее пчёлы. */
  toolActivity?: number;
}) {
  const target = Number.isFinite(growth) ? Math.min(1, Math.max(0, growth)) : 0;
  const lush = unit(cacheReadShare);
  const activity = unit(toolActivity);
  const ui = useMeadowCard();
  const { guests, flipped, scythe } = ui;
  const scale = scaleFor(ui.size);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(target);
  const scaleRef = useRef(scale);
  const metricsRef = useRef({ lush, activity });
  const engineRef = useRef<Engine | null>(null);

  targetRef.current = target;
  scaleRef.current = scale;
  metricsRef.current = { lush, activity };

  useEffect(() => {
    engineRef.current?.setGrowth(target);
  }, [target]);

  useEffect(() => {
    engineRef.current?.setScale(scale);
  }, [scale]);

  useEffect(() => {
    engineRef.current?.setMetrics(lush, activity);
  }, [lush, activity]);

  const guestsRef = useRef(guests);
  guestsRef.current = guests;

  useEffect(() => {
    engineRef.current?.setGuests(guests);
  }, [guests]);

  useEffect(() => {
    engineRef.current?.setFlipped(flipped);
  }, [flipped]);

  useEffect(() => {
    engineRef.current?.setScythe(scythe);
  }, [scythe]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!host || !canvas || !ctx) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motionQuery.matches;
    let theme: Theme = detectTheme(host);
    let scale = scaleRef.current;
    let lush = metricsRef.current.lush;
    let activity = metricsRef.current.activity;
    const mh = (g: number) => meadowHeight(g, scale);
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
    const pokes: { x: number; y: number; dx: number }[] = []; // в координатах холста
    let press: { x: number; lean: number } | null = null; // палец на траве
    let flowers: Flower[] = loadGarden(threadId, host.clientWidth);
    let anyCut = false;
    let regrowTimer = 0;
    let guests = guestsRef.current;
    let flipped = false;
    let scythe = false;
    const ensureRegrow = () => {
      if (regrowTimer || !anyCut || disposed) return;
      regrowTimer = window.setInterval(() => {
        if (document.visibilityState === "hidden") return; // время идёт, рисовать незачем
        if (!frame) draw();
        if (!anyCut) {
          window.clearInterval(regrowTimer);
          regrowTimer = 0;
        }
      }, reduced ? 2000 : 250);
    };

    const mowing = createMowing({
      get width() { return width; }, get height() { return height; },
      get bladeHeight() { return mh(shown); }, get visibleUpTo() { return visibleShare(shown); },
      get blades() { return blades; },
      get flowers() { return flowers; }, get reduced() { return reduced; },
      draw: () => draw(), animate: () => schedule(), regrow: ensureRegrow,
      markCut: () => { anyCut = true; },
      onPass: now => visitors.leave(now, true),
      onStroke: (x, now) => { if (visitors.near(x, 40)) visitors.scare(x, height / 2, now); },
    });
    const visitors = createVisitors({
      bounds: () => ({ width, height, meadow: mh(shown) }),
      flowerHeads: () => flowers.map(f => (f.hx !== undefined && f.hy !== undefined ? { x: f.hx, y: f.hy } : undefined)),
      activity: () => activity,
      guests: () => guests,
      canArrive: () => document.visibilityState !== "hidden" && !flipped && !mowing.running,
      reduced: () => reduced,
      pollinate: (i, animate) => { if (ripenBerry(flowers[i], animate ? performance.now() : 0)) saveGarden(threadId, flowers); },
      animate: () => schedule(),
      redraw: () => draw(),
    });

    const fireflies = createFireflies({
      element: canvas.parentElement ?? host,
      read: () => ({ width, growth: growTo, full: mh(shown), reduced, flowers }),
      onBloom(x) {
        const flower: Flower = {
          at: x / width,
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
            const d = b.x - x;
            if (Math.abs(d) > 60) continue;
            b.vel += Math.sign(d || 1) * 3.2 * Math.exp(-((d / 60) ** 2) * 2) * b.pliancy;
          }
        }
        draw();
        schedule();
      },
    });

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(0, Math.round(rect.width));
      const h = boxHeight(growTo, scale);
      if (w === width && h === height && nextDpr === dpr && blades.length) return;
      const widthChanged = w !== width || !blades.length;
      width = w;
      height = h;
      dpr = nextDpr;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.height = `${height}px`;
      if (widthChanged) blades = buildBlades(threadId, width, theme, lush);
      if (widthChanged) {
        fireflies.resize(width);
        if (width >= 60) fireflies.queue(FIRST_FIREFLY_MS);
      }
      draw();
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (!width) return;
      const full = mh(shown);
      const visibleUpTo = visibleShare(shown);
      const ground = height;
      const seedsVisible = shown > 0.55;
      const now = performance.now();
      anyCut = false;
      for (const b of blades) {
        if (renderBlade(ctx, b, width, ground, full, visibleUpTo, seedsVisible, now)) anyCut = true;
      }
      drawFlowers(ctx, flowers, width, full, ground, shown, theme === "dark");
      fireflies.place(full);
      const dark = theme === "dark";
      mowing.paint(ctx, now, dark);
      visitors.draw(ctx, now, dark);
    };

    // --- Покос и отрастание ----------------------------------------------
    const applyPokes = () => {
      if (!pokes.length) return;
      for (const p of pokes) {
        brushPlants(blades, flowers, p.x, p.y, width, height, mh(shown), p.dx);
      }
      pokes.length = 0;
    };

    const stepGrowth = (now: number) => {
      if (shown === growTo) return false;
      const t = reduced ? 1 : Math.min(1, (now - growStart) / GROW_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      shown = growFrom + (growTo - growFrom) * eased;
      if (t >= 1) shown = growTo;
      return t < 1;
    };

    const tick = (now: number) => {
      frame = 0;
      if (disposed) return;
      const dt = Math.min(0.05, lastTick ? (now - lastTick) / 1000 : 1 / 60);
      lastTick = now;

      let active = stepGrowth(now);

      applyPokes();
      if (mowing.stepMower(now)) active = true;
      if (mowing.stepClippings(dt)) active = true;
      if (visitors.step(now, dt)) active = true;
      if (advancePlants(blades, flowers, dt, now)) active = true;
      if (press) {
        pressPlants(blades, flowers, press.x, press.lean, width, dt); // палец держит траву
        active = true;
      }

      draw();
      ensureRegrow();
      if (active) schedule();
      else lastTick = 0; // покой: ни одного кадра, пока ничего не меняется
    };

    const schedule = () => {
      if (!frame && !disposed && !flipped && document.visibilityState !== "hidden") {
        frame = requestAnimationFrame(tick);
      }
    };

    const straighten = () => {
      for (const blade of blades) blade.bend = 0;
      draw();
    };

    const input = createPointerInput({
      host,
      get height() { return height; },
      get flipped() { return flipped; },
      get scythe() { return scythe; },
      get reduced() { return reduced; },
      get sleeping() { return fireflies.sleeping; },
      cut: (x, y, now) => mowing.selfMow(x, y, now),
      lift: () => mowing.lift(),
      feed: (x, dx, now) => fireflies.feed(x, dx, now),
      stroke(x, y, dx) {
        // Дешёвая отсечка до работы со стеблями — в кадре.
        if (pokes.length < 12) pokes.push({ x, y, dx });
        schedule();
      },
      bend(px, py) {
        // A stationary bend under the pointer gives feedback without swaying.
        const full = mh(shown);
        for (const blade of blades) {
          const distance = blade.x - px;
          const weight = Math.max(0, 1 - Math.abs(distance) / REACH);
          blade.bend = py >= height - full * blade.h - 6 ? Math.sign(distance) * weight * 0.65 : 0;
        }
        draw();
      },
      straighten,
      press(x, lean) {
        if (reduced) {
          leanAway(blades, x); // неподвижно, без укладывания по свайпу
          draw();
          return;
        }
        press = { x, lean };
        schedule();
      },
      release() {
        press = null; // пружина мягко поднимает траву
        if (reduced) straighten();
        else schedule();
      },
      near: (x, y, now) => { if (visitors.present()) visitors.scare(x, y, now); },
    });

    const refreshTheme = () => {
      const next = detectTheme(host);
      if (next === theme) return;
      theme = next;
      for (const b of blades) [b.fill, b.rib] = colorFor(b, theme, lush);
      draw();
    };

    const onMotionChange = () => {
      reduced = motionQuery.matches;
      if (reduced) {
        for (const b of blades) { b.bend = 0; b.vel = 0; }
        for (const f of flowers) { f.bend = 0; f.vel = 0; f.born = 0; }
        mowing.finishImmediately();
        visitors.reducedChanged();
        press = null;
        shown = growTo;
        pokes.length = 0;
        draw();
      } else {
        schedule();
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
        if (g > growFrom) {
          // Новый ход подгоняет скошенную траву.
          for (const b of blades) if (b.cutAt) b.cutAt -= REGROW_MS * TURN_REGROW_BOOST;
        }
        resize();
        schedule();
        fireflies.queue(1200); // в подросшем луге появилось место для цветка
      },
      setScale(next: number) {
        if (next === scale) return;
        scale = next;
        resize();
        draw();
      },
      setMetrics(nextLush: number | undefined, nextActivity: number | undefined) {
        activity = nextActivity;
        if (nextLush === lush) return;
        lush = nextLush;
        for (const b of blades) [b.fill, b.rib] = colorFor(b, theme, lush);
        draw();
      },
      mow: mowing.mow,
      setGuests(next: Guests) {
        guests = next;
        visitors.guestsChanged();
      },
      setFlipped(next: boolean) {
        if (next === flipped) return;
        flipped = next;
        input.reset();
        if (flipped) {
          // Лицевая сторона скрыта: кадры не нужны.
          if (frame) cancelAnimationFrame(frame);
          frame = 0;
          lastTick = 0;
        } else {
          schedule();
        }
      },
      setScythe(on: boolean) {
        scythe = on;
        input.reset(); // режим сменился посреди жеста: начинаем заново
      },
    };

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(host);
    const themeObserver = new MutationObserver(refreshTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    schemeQuery.addEventListener("change", refreshTheme);
    motionQuery.addEventListener("change", onMotionChange);
    input.attach();
    document.addEventListener("visibilitychange", onVisibility);

    resize();
    schedule();
    fireflies.queue(FIRST_FIREFLY_MS);
    visitors.queue(FIRST_VISITOR_MS);

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      engineRef.current = null;
      resizeObserver.disconnect();
      themeObserver.disconnect();
      schemeQuery.removeEventListener("change", refreshTheme);
      motionQuery.removeEventListener("change", onMotionChange);
      input.detach();
      document.removeEventListener("visibilitychange", onVisibility);
      if (regrowTimer) window.clearInterval(regrowTimer);
      visitors.dispose();
      fireflies.dispose();
      flowers = [];
      blades = [];
      pokes.length = 0;
      canvas.width = canvas.height = 0; // освобождаем буфер холста
    };
  }, [threadId]);

  return (
    <MeadowCard ui={ui} hostRef={hostRef} canvasRef={canvasRef} box={boxHeight(target, scale)} onMow={() => engineRef.current?.mow()} />
  );
}
