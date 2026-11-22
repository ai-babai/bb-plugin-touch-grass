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
import { type Guests, type MeadowSize, scaleFor } from "./meadow-prefs";
import { watchChatSpan } from "./meadow-reach";
import { createHitArea } from "./meadow-hit";
import { createMeadowClock, type MeadowClock } from "./meadow-clock";
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
const SPROUT_MS = 800; // «Вырастить сейчас»: низкая и скошенная трава плавно поднимается
const WILD_TICK_MS = 4000; // «Заросли» растут за десятки минут: редкая перерисовка вместо кадров

/** Доля высоты при прорастании: от прежней к часам, но не выше часов — свежий срез и зрелая трава не дёргаются. */
function sproutShare(target: number, from: number | undefined, eased: number) {
  return from === undefined ? target : Math.min(target, from + (target - from) * eased);
}

function unit(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined;
}

type Engine = {
  setGrowth(g: number): void;
  setSize(size: MeadowSize): void;
  setMetrics(lush: number | undefined, activity: number | undefined): void;
  mow(): void;
  setGuests(guests: Guests): void;
  setFlipped(flipped: boolean): void;
  setScythe(on: boolean): void;
  setMinutes(minutes: number): void;
  growNow(): void;
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
  const sizeRef = useRef(ui.size);
  const minutesRef = useRef(ui.regrowMinutes);
  minutesRef.current = ui.regrowMinutes;
  const setReadyAt = ui.setReadyAt;
  const metricsRef = useRef({ lush, activity });
  const engineRef = useRef<Engine | null>(null);

  targetRef.current = target;
  sizeRef.current = ui.size;
  metricsRef.current = { lush, activity };

  useEffect(() => {
    engineRef.current?.setGrowth(target);
  }, [target]);

  useEffect(() => {
    engineRef.current?.setSize(ui.size);
  }, [ui.size]);

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
    engineRef.current?.setMinutes(ui.regrowMinutes);
  }, [ui.regrowMinutes]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!host || !canvas || !ctx) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = motionQuery.matches;
    let theme: Theme = detectTheme(host);
    let size = sizeRef.current;
    let scale = scaleFor(size);
    let canopy: ReturnType<typeof watchChatSpan> | undefined;
    const hitArea = createHitArea(host.querySelector<HTMLElement>(".tg-hit"), () => draw());
    let wasCut = false;
    let lush = metricsRef.current.lush;
    let activity = metricsRef.current.activity;
    const mh = (g: number) => meadowHeight(g, scale);
    let width = 0;
    let height = 0;
    let dpr = 1;
    let blades: Blade[] = [];
    // «Заросли»: высоту задают часы луга (реальное время), ходы не влияют, густота — взрослая.
    let clock: MeadowClock | undefined;
    // Прорастание после «Вырастить сейчас»: доли высоты травинок до нажатия (performance-время анимации).
    let sprout: { start: number; from: WeakMap<Blade, number> } | null = null;
    let turnGrowth = targetRef.current;
    const growthGoal = () => (clock ? 1 : turnGrowth);
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
      }, clock ? WILD_TICK_MS : reduced ? 2000 : 250);
    };
    const restartRegrow = () => {
      window.clearInterval(regrowTimer);
      regrowTimer = 0;
      ensureRegrow();
    };

    const mowing = createMowing({
      get width() { return width; }, get height() { return height; },
      get bladeHeight() { return mh(shown); }, get visibleUpTo() { return visibleShare(shown); },
      get blades() { return blades; },
      get flowers() { return flowers; }, get reduced() { return reduced; },
      draw: () => draw(), animate: () => schedule(), regrow: ensureRegrow,
      markCut: () => { anyCut = true; hitArea.invalidate(); },
      onPass: now => visitors.leave(now, true),
      onStroke: (x, now) => { if (visitors.near(x, 40)) visitors.scare(x, height / 2, now); },
      cutWild: (b, keep) => clock?.cut(b.x, keep * b.h, Date.now()),
      onMowed: () => { sprout = null; clock?.restart(Date.now()); },
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
      scale = canopy ? canopy.reach(rect.bottom) / meadowHeight(1, 1) : scaleFor(size);
      const h = boxHeight(growTo, scale);
      const widthChanged = w !== width || !blades.length;
      if (!widthChanged && h === height && nextDpr === dpr) return;
      width = w;
      height = h;
      dpr = nextDpr;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.height = `${height}px`;
      hitArea.invalidate();
      if (widthChanged) {
        blades = buildBlades(threadId, width, theme, lush);
        fireflies.resize(width);
        if (width >= 60) fireflies.queue(FIRST_FIREFLY_MS);
      }
      draw();
    };

    /** «Заросли»: высоты травинок по часам луга. true — ещё растут (редкий тик, профиль попаданий). */
    const applyClock = () => {
      if (!clock) return false;
      const wall = Date.now();
      const t = sprout ? Math.min(1, (performance.now() - sprout.start) / SPROUT_MS) : 1;
      const eased = 1 - (1 - t) ** 3;
      for (const b of blades) b.wild = sproutShare(clock.share(b.x, b.h, wall), sprout?.from.get(b), eased);
      if (t >= 1) sprout = null;
      return sprout !== null || wall < clock.readyAt();
    };

    /** Слой попаданий «Зарослей» следует за профилем травы. */
    const updateHitArea = (full: number, visibleUpTo: number, now: number) => {
      if (wasCut && !anyCut) hitArea.invalidate(); // трава отросла полностью
      wasCut = anyCut;
      hitArea.update({ blades, width, height, full, visibleUpTo, now }, anyCut || shown !== growTo, !!canopy);
    };

    const draw = () => {
      // Луг не виден (настройки, скрытая вкладка): таймеры и отложенные вызовы не рисуют.
      // Время в траве не теряется — его считают от now; возврат зовёт schedule(), и кадр всё нарисует.
      if (flipped || document.visibilityState === "hidden") return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (!width) return;
      const full = mh(shown);
      const visibleUpTo = visibleShare(shown);
      const ground = height;
      const seedsVisible = shown > 0.55;
      const now = performance.now();
      const wildGrowing = applyClock();
      anyCut = false;
      for (const b of blades) {
        if (renderBlade(ctx, b, width, ground, full, visibleUpTo, seedsVisible, now)) anyCut = true;
      }
      anyCut ||= wildGrowing;
      drawFlowers(ctx, flowers, width, full, ground, shown, theme === "dark");
      updateHitArea(full, visibleUpTo, now);
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
      if (active || sprout) schedule();
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
        sprout = null;
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

    const configureCanopy = () => {
      canopy?.dispose();
      canopy = size === "overgrown" ? watchChatSpan(host, resize) : undefined;
    };

    /** Часы «Зарослей» живут, пока выбран этот размер; запись в localStorage переживает смену режима. */
    const configureClock = () => {
      sprout = null;
      clock?.flush();
      clock = size === "overgrown" ? createMeadowClock(threadId, minutesRef.current, setReadyAt) : undefined;
      if (!clock) setReadyAt(0);
      for (const b of blades) {
        b.wild = undefined;
        if (clock) b.cutAt = 0; // минутные прокосы других режимов в заросли не переносятся
      }
      retarget(growthGoal());
      restartRegrow();
      schedule();
    };

    const retarget = (g: number) => {
      if (g === growTo) return;
      growFrom = shown;
      growTo = g;
      growStart = performance.now();
    };
    const flushClock = () => clock?.flush();

    engineRef.current = {
      setGrowth(g: number) {
        turnGrowth = g;
        if (clock || g === growTo) return; // в зарослях ходы не меняют ни высоту, ни часы
        retarget(g);
        if (g > growFrom) {
          // Новый ход подгоняет скошенную траву.
          for (const b of blades) if (b.cutAt) b.cutAt -= REGROW_MS * TURN_REGROW_BOOST;
        }
        resize();
        schedule();
        fireflies.queue(1200); // в подросшем луге появилось место для цветка
      },
      setSize(next: MeadowSize) {
        if (next === size) return;
        size = next;
        configureCanopy();
        configureClock();
        hitArea.invalidate();
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
      growNow() {
        if (!clock) return;
        // Без reduced motion низкие участки дорастают за SPROUT_MS; часы сохраняют зрелость сразу.
        sprout = reduced ? null : { start: performance.now(), from: new WeakMap(blades.map(b => [b, b.wild ?? 1])) };
        clock.growNow(Date.now());
        hitArea.invalidate();
        draw();
        schedule();
      },
      setMinutes(minutes: number) {
        clock?.setMinutes(minutes);
        draw();
        ensureRegrow();
      },
    };

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(host);
    configureCanopy();
    configureClock();
    window.addEventListener("pagehide", flushClock);
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
      hitArea.dispose();
      canopy?.dispose();
      flushClock();
      window.removeEventListener("pagehide", flushClock);
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
    <MeadowCard ui={ui} hostRef={hostRef} canvasRef={canvasRef} box={boxHeight(target, scale)} onMow={() => engineRef.current?.mow()}
      onGrowNow={() => engineRef.current?.growNow()} />
  );
}
