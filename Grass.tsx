import { createFireflies } from "./fireflies";
import { createNaturalBloom } from "./meadow-bloom";
import { type Blade, type Theme, boxHeight, buildBlades, colorFor, meadowHeight } from "./blades";
import { createFlowerSlots, drawFlower, type Flower, gardenCapacity, loadGarden, ripenBerry, saveGarden } from "./garden";
import { STRAWBERRY } from "./strawberry";
import { createDandelions } from "./dandelion";
import { advancePlants, brushPlants, leanAway, pressPlants, REACH, tiltFlowers } from "./meadow-physics";
import { detectTheme } from "./meadow-theme";
import { drawLayers } from "./meadow-layers";
import { mowerDeckPx } from "./meadow-critters";
import { renderBlade } from "./draw-blade";
import { useEffect, useRef } from "react";
import "./grass.css";
import { createMowing } from "./mowing";
import { createVisitors, FIRST_VISITOR_MS } from "./meadow-visitors";
import { createPointerInput } from "./meadow-input";
import { type Guests, type MeadowSize, scaleFor } from "./meadow-prefs";
import { watchChatSpan } from "./meadow-reach";
import { createFlowerHits } from "./flower-hit";
import { createHitArea } from "./meadow-hit";
import { createMeadowClock, type MeadowClock } from "./meadow-clock";
import { anyGrowing, DANDELION, flowersReadyAt, matureFlowers, plantedAt } from "./flower-growth";
import { createFlowerCanopy } from "./flower-canopy";
import { MeadowCard } from "./MeadowCard";
import { useMeadowCard } from "./useMeadowCard";

/**
 * Полоска травы над полем ввода чата.
 * growth (0..1) отражает число ходов и определяет вместимость клумбы.
 * Рисунок детерминирован по threadId, курсор пригибает стебли без клика.
 *
 * Мини-игра «Светлячки»: в траве спит светлячок. Если гладить траву над ним,
 * он разгорается, просыпается и улетает, а на его месте распускается цветок.
 * Цветы сохраняются по треду; места на клумбе прибавляется вместе с чатом.
 *
 * Посетители: к цветам прилетает пчела, над лугом порхает бабочка; от курсора
 * они отлетают. «Газонокосилка» проезжает полосу, «Косой» косят сами.
 * Высота травы в долях — одни часы треда для всех размеров (meadow-clock): покос,
 * отрастание за выбранный срок, «Вырастить сейчас», время идёт и в фоне. Размер задаёт
 * только максимум и расположение; ходы растят луг Compact/Tall, но не ускоряют отрастание.
 * Разметка и кнопки — MeadowCard, состояние — useMeadowCard, ввод — meadow-input,
 * предпочтения — meadow-prefs.
 */

// Рисунок луга всегда взрослый: густота и максимум не зависят от числа ходов, высоту
// в долях даёт только часы луга (meadow-clock). Ходы растят лишь вместимость клумбы.
const MATURE = 1;

const FIRST_FIREFLY_MS = 20_000; // первый светлячок не сразу: сначала луг и естественное цветение
const ROOM_FIREFLY_MS = 15_000; // на клумбе освободилось место
const CLUMP_KINDS = [1, 2]; // василёк и клевер растут небольшими пучками
const CLUMP_CHANCE = 0.5;

const SPROUT_MS = 800; // «Вырастить сейчас»: низкая и скошенная трава плавно поднимается
const REGROW_TICK_MS = 4000; // отрастание идёт минутами: редкая перерисовка вместо кадров
const FIELD_KINDS = [0, 1, 2, 3]; // ромашка, василёк, клевер, лютик
const WILD_KINDS = [...FIELD_KINDS, DANDELION, STRAWBERRY];

/** Доля высоты при прорастании: от прежней к часам, но не выше часов — свежий срез и зрелая трава не дёргаются. */
function sproutShare(target: number, from: number | undefined, eased: number) {
  return from === undefined ? target : Math.min(target, from + (target - from) * eased);
}

/**
 * Пучок: естественное цветение василька или клевера иногда даёт 2–3 стебля из одного места.
 * Каждый стебель — обычный цветок сада (отдельно косится, пчела садится на свою головку).
 */
function clumpOffsets() {
  const side = Math.random() < 0.5 ? -1 : 1;
  const offsets = [0, side * (5 + Math.random() * 4)];
  if (Math.random() < 0.5) offsets.push(-side * (4 + Math.random() * 4));
  return offsets;
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
  const { setReadyAt, setFlowerDeadline } = ui;
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
    const updateFlowerHits = createFlowerHits(host);
    let wasCut = false;
    let lush = metricsRef.current.lush;
    let activity = metricsRef.current.activity;
    const fullPx = () => meadowHeight(MATURE, scale); // максимум травы этого размера, px
    let width = 0;
    let height = 0;
    let dpr = 1;
    let blades: Blade[] = [];
    // Часы луга этого треда — одни на все размеры; создаются ниже, после announceReady.
    let clock: MeadowClock;
    // Прорастание после «Вырастить сейчас»: доли высоты травинок до нажатия (performance-время анимации).
    let sprout: { start: number; from: WeakMap<Blade, number> } | null = null;
    let turnGrowth = targetRef.current; // история ходов 0..1: только вместимость клумбы
    let frame = 0;
    let lastTick = 0;
    let disposed = false;
    const pokes: { x: number; y: number; dx: number }[] = []; // в координатах холста
    let press: { x: number; y: number; lean: number } | null = null; // палец на траве
    let flowers: Flower[] = loadGarden(threadId, host.clientWidth);
    let anyCut = false;
    let regrowTimer = 0;
    let guests = guestsRef.current;
    let flipped = false;
    let scythe = false;
    // Редкая перерисовка, пока что-то растёт само: трава по часам луга и цветы.
    // Пока луг не виден (вкладка скрыта, карточка перевёрнута), таймер стоит; рост считается
    // по часам, поэтому ничего не теряется: кадр возврата рисует актуальный луг и снова ставит таймер.
    const growing = () => anyCut || anyGrowing(flowers);
    const unseen = () => flipped || document.visibilityState === "hidden";
    let regrowPaused = false;
    const ensureRegrow = () => {
      if (disposed || regrowTimer || unseen()) return;
      if (regrowPaused) {
        regrowPaused = false;
        if (!growing()) announceReady(); // дозрело, пока луг был скрыт
      }
      if (!growing()) return;
      regrowTimer = window.setInterval(() => {
        if (document.visibilityState === "hidden") return; // время идёт, рисовать незачем
        if (!frame) draw();
        if (growing()) return;
        window.clearInterval(regrowTimer);
        regrowTimer = 0;
        announceReady(); // последний цветок созрел
      }, REGROW_TICK_MS);
    };
    const pauseRegrow = () => {
      if (!regrowTimer) return;
      window.clearInterval(regrowTimer);
      regrowTimer = 0;
      regrowPaused = true;
    };
    // Отсчёт до зрелости луга и растущих цветов: «Вырастить сейчас» доводит до зрелости всё.
    let clockReady = 0;
    const announceReady = () => {
      setReadyAt(clockReady);
      setFlowerDeadline(flowersReadyAt(flowers));
    };

    const mowing = createMowing({
      get width() { return width; }, get height() { return height; },
      get bladeHeight() { return fullPx(); }, get visibleUpTo() { return MATURE; },
      get blades() { return blades; },
      get flowers() { return flowers; }, get shown() { return MATURE; }, get reduced() { return reduced; },
      draw: () => draw(), animate: () => schedule(), regrow: ensureRegrow,
      markCut: () => { anyCut = true; hitArea.invalidate(); },
      onPass: now => visitors.leave(now, true),
      onStroke: (x, now) => { if (visitors.near(x, 40)) visitors.scare(x, height / 2, now); },
      recordCut: (b, keep) => clock.cut(b.x, keep * b.h, Date.now()),
      onMowed: () => { sprout = null; clock.restart(Date.now()); naturalBloom.restart(); },
      cutFlowers(cut) {
        if (!cut.length) return;
        // Один общий сад: убираем на месте, ссылки соседей (светлячок, цветение) остаются верными.
        for (const f of cut) {
          const i = flowers.indexOf(f);
          if (i >= 0) flowers.splice(i, 1);
        }
        saveGarden(threadId, flowers);
        naturalBloom.restart();
        announceReady();
        fireflies.queue(ROOM_FIREFLY_MS); // освободилось место на клумбе
      },
    });
    // Пчела помнит номер цветка: после среза номера остальных не сдвигаются, пока она на лугу.
    const flowerSlots = createFlowerSlots(() => flowers, () => visitors.present());
    const dandelions = createDandelions(() => saveGarden(threadId, flowers)); // шарик редеет — сад помнит
    const visitors = createVisitors({
      bounds: () => ({ width, height, meadow: fullPx() }),
      flowerHeads: () => flowerSlots.heads(),
      activity: () => activity,
      guests: () => guests,
      canArrive: () => document.visibilityState !== "hidden" && !flipped && !mowing.running,
      reduced: () => reduced,
      pollinate: (i, animate) => { if (ripenBerry(flowerSlots.at(i), animate ? performance.now() : 0)) saveGarden(threadId, flowers); },
      animate: () => schedule(),
      redraw: () => draw(),
    });

    const fireflies = createFireflies({
      element: canvas.parentElement ?? host,
      read: () => ({ width, growth: turnGrowth, full: fullPx(), reduced, flowers }),
      onBloom(x) {
        plant(x / width);
        naturalBloom.restart();
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

    /** Новый цветок в доле ширины at: светлячок или естественное цветение. Раскрывается анимацией, если движение не уменьшено. */
    const plant = (at: number, wild = false) => {
      // Светлячок дарит полевой цветок 0–3; само по себе в цветущем луге растут ещё одуванчик и земляника (последней).
      const kinds = wild && flowers.length ? WILD_KINDS : FIELD_KINDS;
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const stems = wild && CLUMP_KINDS.includes(kind) && Math.random() < CLUMP_CHANCE ? clumpOffsets() : [0];
      const room = gardenCapacity(turnGrowth) - flowers.length - Number(fireflies.sleeping);
      for (const [i, dx] of stems.slice(0, Math.max(1, room)).entries()) {
        const flower: Flower = {
          at: Math.max(0.02, Math.min(0.98, at + dx / Math.max(1, width))),
          kind,
          born: reduced ? 0 : performance.now(),
          bend: 0,
          vel: 0,
        };
        if (kind === STRAWBERRY) flower.ripe = 0;
        // Растёт с ростка; соседи пучка чуть старше — не одинаковые столбики.
        flower.planted = plantedAt(kind, Date.now() - i * (20_000 + Math.random() * 40_000));
        flowers.push(flower);
      }
      saveGarden(threadId, flowers);
      announceReady();
    };

    const naturalBloom = createNaturalBloom({
      threadId,
      hasRoom: () => flowers.length + Number(fireflies.sleeping) < gardenCapacity(turnGrowth),
      open: () => document.visibilityState !== "hidden" && !flipped && !mowing.running && width >= 60,
      spots: () => flowers.map(f => f.at),
      bloom(at) {
        plant(at, true);
        draw();
        schedule();
      },
    });

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(0, Math.round(rect.width));
      scale = canopy ? canopy.reach(rect.bottom) / meadowHeight(1, 1) : scaleFor(size);
      const h = boxHeight(MATURE, scale);
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
        naturalBloom.check();
        blades = buildBlades(threadId, width, theme, lush);
        flowerCanopy.relayout();
        fireflies.resize(width);
        if (width >= 60) fireflies.queue(FIRST_FIREFLY_MS);
      }
      draw();
    };

    /** Высоты травинок по часам луга, во всех размерах. true — ещё растут (редкий тик, профиль попаданий). */
    // Рост луга в целом (0..1) по часам, без учёта местных прокосов.
    let meadowShare = 1;
    const applyClock = (full: number) => {
      const deckShare = mowerDeckPx(height) / full;
      const wall = Date.now();
      const t = sprout ? Math.min(1, (performance.now() - sprout.start) / SPROUT_MS) : 1;
      const eased = 1 - (1 - t) ** 3;
      meadowShare = 0;
      for (const b of blades) {
        b.grown = sproutShare(clock.share(b.x, b.h, wall, deckShare), sprout?.from.get(b), eased);
        if (b.grown > meadowShare) meadowShare = b.grown; // нескошенный столбец = часы луга
      }
      if (t >= 1) sprout = null;
      return sprout !== null || wall < clock.readyAt();
    };

    /**
     * Цветы стоят по местной массе травы: стебель от её высоты (flower-canopy), головки чуть выше.
     * Масса — стоящая трава без местных срезов, в «Зарослях» — по росту всего луга, поэтому
     * после покоса цветы невысокие вместе с травой, а срез косой рядом не дёргает цветок.
     */
    const flowerCanopy = createFlowerCanopy();
    const placeFlowers = (full: number, visibleUpTo: number) => {
      for (const f of flowers) {
        f.mass = full * flowerCanopy.at(f, blades, f.at * width, visibleUpTo) * meadowShare;
        f.room = height;
      }
    };

    /** Слой попаданий «Зарослей» следует за профилем травы. */
    const updateHitArea = (full: number, visibleUpTo: number, now: number) => {
      if (wasCut && !anyCut) hitArea.invalidate(); // трава отросла полностью
      wasCut = anyCut;
      // Цветы принимают касание своим слоем (flower-hit): здесь только трава.
      hitArea.update({ blades, width, height, full, visibleUpTo, now }, anyCut, !!canopy);
    };

    const draw = () => {
      // Луг не виден (настройки, скрытая вкладка): таймеры и отложенные вызовы не рисуют.
      // Время в траве не теряется — его считают от now; возврат зовёт schedule(), и кадр всё нарисует.
      if (flipped || document.visibilityState === "hidden") return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (!width) return;
      const full = fullPx();
      const visibleUpTo = MATURE;
      const ground = height;
      const seedsVisible = true;
      const now = performance.now();
      const wildGrowing = applyClock(full);
      placeFlowers(full, visibleUpTo);
      const dark = theme === "dark";
      // Цветы стоят в траве: передняя доля травинок рисуется поверх них (meadow-layers).
      // Пчела у своего цветка рисуется сразу после него — под теми же передними травинками.
      const nest = flowerSlots.at(visitors.nest());
      let guestDrawn = false;
      anyCut = drawLayers(
        blades, flowers,
        b => renderBlade(ctx, b, width, ground, full, visibleUpTo, seedsVisible),
        f => {
          drawFlower(ctx, f, width, full, ground, MATURE, dark, now);
          if (f !== nest) return;
          visitors.draw(ctx, now, dark);
          guestDrawn = true;
        },
      );
      anyCut ||= wildGrowing;
      updateHitArea(full, visibleUpTo, now);
      if (canopy) updateFlowerHits(flowers, width, full, MATURE, now);
      fireflies.place(full);
      dandelions.paint(ctx, now, dark);
      mowing.paint(ctx, now, dark);
      if (!guestDrawn) visitors.draw(ctx, now, dark);
    };

    // --- Покос и отрастание ----------------------------------------------
    const applyPokes = () => {
      if (!pokes.length) return;
      for (const p of pokes) {
        brushPlants(blades, flowers, p.x, p.y, width, height, fullPx(), p.dx);
      }
      pokes.length = 0;
    };

    /** Пружины травы и цветов, палец на траве, пушинки одуванчиков. true — нужен следующий кадр. */
    const stepPlants = (dt: number, now: number) => {
      let active = advancePlants(blades, flowers, dt, now);
      if (press) {
        pressPlants(blades, flowers, press.x, press.y, press.lean, width, dt); // палец держит траву и цветы
        active = true;
      }
      return dandelions.step(flowers, dt, now) || active; // встряхнутый шарик роняет пушинки
    };

    const tick = (now: number) => {
      frame = 0;
      if (disposed) return;
      const dt = Math.min(0.05, lastTick ? (now - lastTick) / 1000 : 1 / 60);
      lastTick = now;

      applyPokes();
      let active = mowing.stepMower(now);
      if (mowing.stepClippings(dt)) active = true;
      if (visitors.step(now, dt)) active = true;
      if (stepPlants(dt, now)) active = true;

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
      for (const f of flowers) f.bend = 0;
      dandelions.nudge(flowers);
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
        const full = fullPx();
        for (const blade of blades) {
          const distance = blade.x - px;
          const weight = Math.max(0, 1 - Math.abs(distance) / REACH);
          blade.bend = py >= height - full * blade.h - 6 ? Math.sign(distance) * weight * 0.65 : 0;
        }
        tiltFlowers(flowers, px, py, width, REACH);
        dandelions.nudge(flowers);
        draw();
      },
      straighten,
      press(x, y, lean) {
        if (reduced) {
          leanAway(blades, flowers, x, y, width); // неподвижно, без укладывания по свайпу
          dandelions.nudge(flowers);
          draw();
          return;
        }
        press = { x, y, lean };
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
        pokes.length = 0;
        draw();
      } else {
        schedule();
      }
    };

    const onVisibility = () => {
      naturalBloom.check();
      if (document.visibilityState === "hidden") {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        lastTick = 0;
        pauseRegrow();
      } else {
        schedule();
      }
    };

    const configureCanopy = () => {
      canopy?.dispose();
      canopy = size === "overgrown" ? watchChatSpan(host, resize) : undefined;
    };

    // Одни часы на тред: формат хранения прежний (ключ bb-touch-grass:overgrown:<threadId>).
    clock = createMeadowClock(threadId, minutesRef.current, at => { clockReady = at; announceReady(); });
    announceReady();

    const flushClock = () => clock.flush();

    engineRef.current = {
      setGrowth(g: number) {
        if (g === turnGrowth) return;
        const roomier = gardenCapacity(g) > gardenCapacity(turnGrowth);
        turnGrowth = g; // ходы не трогают ни часы, ни высоту травы
        naturalBloom.check();
        if (roomier) fireflies.queue(ROOM_FIREFLY_MS); // в разросшемся чате появилось место для цветка
      },
      setSize(next: MeadowSize) {
        if (next === size) return;
        size = next;
        configureCanopy(); // часы и прокосы общие; меняются только максимум и расположение
        naturalBloom.check();
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
        naturalBloom.check();
        input.reset();
        if (flipped) {
          // Лицевая сторона скрыта: кадры не нужны.
          if (frame) cancelAnimationFrame(frame);
          frame = 0;
          lastTick = 0;
          pauseRegrow();
        } else {
          schedule();
        }
      },
      setScythe(on: boolean) {
        scythe = on;
        input.reset(); // режим сменился посреди жеста: начинаем заново
      },
      growNow() {
        // Без reduced motion низкие участки дорастают за SPROUT_MS; часы сохраняют зрелость сразу.
        sprout = reduced ? null : { start: performance.now(), from: new WeakMap(blades.map(b => [b, b.grown])) };
        clock.growNow(Date.now());
        if (matureFlowers(flowers)) saveGarden(threadId, flowers);
        announceReady();
        hitArea.invalidate();
        draw();
        schedule();
      },
      setMinutes(minutes: number) {
        clock.setMinutes(minutes);
        draw();
        ensureRegrow();
      },
    };

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(host);
    configureCanopy();
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
      naturalBloom.dispose();
      flowers = [];
      blades = [];
      pokes.length = 0;
      canvas.width = canvas.height = 0; // освобождаем буфер холста
    };
  }, [threadId]);

  return (
    <MeadowCard ui={ui} hostRef={hostRef} canvasRef={canvasRef} box={boxHeight(MATURE, scale)} onMow={() => engineRef.current?.mow()}
      onGrowNow={() => engineRef.current?.growNow()} />
  );
}
