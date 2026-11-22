/**
 * Ввод указателя на лугу.
 *
 * Без косы мышь гладит траву и будит светлячка. Палец прижимает траву шире:
 * сразу раздвигает её в стороны, при свайпе укладывает по направлению, после
 * отпускания трава мягко встаёт. Вертикальный свайп прокручивает чат (pan-y),
 * pointercancel отпускает траву.
 * В «Зарослях» нажатие на стоящую траву (слой .tg-hit) мышью или пальцем
 * пригибает её и захватывает указатель, чтобы жест не обрывался на стеблях.
 * С косой нажатие захватывает указатель и срезает траву вдоль движения;
 * светлячок от покоса не заряжается. Кнопки и оборот карточки траву не трогают.
 */

const STROKE_GAP_MS = 120; // дольше пауза — новый жест, а не продолжение
const CONTROLS = ".tg-control, .tg-back";
const GRASS_HIT = ".tg-hit";

export interface PointerSite {
  readonly host: HTMLElement;
  /** Высота холста травы, прижатого к низу оболочки. */
  readonly height: number;
  readonly flipped: boolean;
  readonly scythe: boolean;
  readonly reduced: boolean;
  readonly sleeping: boolean;
  cut(x: number, y: number, now: number): void;
  lift(): void;
  feed(x: number, dx: number, now: number): void;
  stroke(x: number, y: number, dx: number): void;
  /** Палец на траве: lean -1..1 — куда уложить, 0 — в стороны от пальца. */
  press(x: number, lean: number): void;
  release(): void;
  bend(x: number, y: number): void;
  straighten(): void;
  near(x: number, y: number, now: number): void;
}

type Mark = { x: number; t: number };

const LEAN_KEEP = 0.6; // память направления свайпа между событиями
const LEAN_PER_PX = 0.1; // сколько направления даёт пиксель свайпа

export function createPointerInput(site: PointerSite) {
  let cutting: number | null = null;
  let brushMark: Mark | null = null;
  let gameMark: Mark | null = null;
  let finger: { id: number; x: number; lean: number } | null = null;

  const local = (event: PointerEvent) => {
    const rect = site.host.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.bottom + site.height };
  };

  const onControl = (event: Event) =>
    site.flipped || (event.target instanceof Element && !!event.target.closest(CONTROLS));

  /** Следующая отметка жеста и сдвиг от прошлой, если жест продолжается. */
  const follow = (prev: Mark | null, event: PointerEvent): [Mark, number | null] => {
    const mark = { x: event.clientX, t: event.timeStamp || performance.now() };
    const continues = prev !== null && mark.t - prev.t <= STROKE_GAP_MS;
    return [mark, continues ? mark.x - prev.x : null];
  };

  const forget = () => {
    brushMark = null;
    gameMark = null;
  };

  const stopCutting = () => {
    if (cutting === null) return;
    const id = cutting;
    cutting = null;
    site.lift();
    if (site.host.hasPointerCapture?.(id)) site.host.releasePointerCapture(id);
  };

  const lift = () => {
    if (finger === null) return;
    finger = null;
    site.release();
  };

  const startPress = (event: PointerEvent) => {
    const { x } = local(event);
    finger = { id: event.pointerId, x: event.clientX, lean: 0 };
    site.press(x, 0);
  };

  const followPress = (event: PointerEvent, x: number) => {
    if (finger === null) return;
    const dx = event.clientX - finger.x;
    finger.x = event.clientX;
    finger.lean = Math.max(-1, Math.min(1, finger.lean * LEAN_KEEP + dx * LEAN_PER_PX));
    site.press(x, finger.lean);
  };

  const feedFirefly = (event: PointerEvent, x: number) => {
    if (!site.sleeping) {
      gameMark = null;
      return;
    }
    const [mark, dx] = follow(gameMark, event);
    gameMark = mark;
    if (dx !== null) site.feed(x, dx, performance.now());
  };

  const brush = (event: PointerEvent, x: number, y: number) => {
    if (site.reduced) {
      site.bend(x, y); // неподвижный наклон под указателем вместо качания
      return;
    }
    const [mark, dx] = follow(brushMark, event);
    brushMark = mark;
    if (dx !== null && Math.abs(dx) >= 0.5) site.stroke(x, y, dx);
  };

  const capture = (event: PointerEvent) => {
    try {
      site.host.setPointerCapture(event.pointerId);
    } catch {
      // Указатель уже отпущен: жест из одной точки.
    }
  };

  const onGrass = (event: Event) => event.target instanceof Element && !!event.target.closest(GRASS_HIT);

  const startHold = (event: PointerEvent) => {
    const grass = onGrass(event);
    if (event.pointerType !== "touch" && !grass) return; // мышь в полосе гладит без нажатия
    if (grass) {
      event.preventDefault(); // трава, а не выделение текста за ней
      capture(event);
    }
    startPress(event);
  };

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || onControl(event)) return;
    if (!site.scythe) {
      startHold(event);
      return;
    }
    event.preventDefault(); // без выделения и эмуляции мыши
    stopCutting();
    cutting = event.pointerId;
    capture(event);
    const { x, y } = local(event);
    site.cut(x, y, performance.now());
  };

  const onMove = (event: PointerEvent) => {
    if (onControl(event)) return;
    const { x, y } = local(event);
    const now = performance.now();
    site.near(x, y, now);
    if (cutting === event.pointerId) {
      site.cut(x, y, now);
      return; // покос не заряжает светлячка
    }
    if (site.scythe) return;
    feedFirefly(event, x);
    if (finger?.id === event.pointerId) followPress(event, x);
    else if (event.pointerType !== "touch") brush(event, x, y);
  };

  const onEnd = (event: PointerEvent) => {
    if (cutting === event.pointerId) stopCutting();
    if (finger?.id !== event.pointerId) return;
    lift();
    if (site.host.hasPointerCapture?.(event.pointerId)) site.host.releasePointerCapture(event.pointerId);
  };

  const onCancel = (event: PointerEvent) => {
    onEnd(event);
    onLeave();
  };

  const onLeave = () => {
    if (cutting !== null || finger !== null) return; // захваченный указатель ещё на траве
    forget();
    if (site.reduced) site.straighten();
  };

  const listeners: [string, (event: PointerEvent) => void, AddEventListenerOptions?][] = [
    ["pointerdown", onDown],
    ["pointermove", onMove, { passive: true }],
    ["pointerup", onEnd],
    ["pointercancel", onCancel],
    ["lostpointercapture", onEnd],
    ["pointerleave", onLeave],
  ];

  return {
    attach() {
      for (const [type, fn, options] of listeners) site.host.addEventListener(type, fn as EventListener, options);
    },
    detach() {
      for (const [type, fn] of listeners) site.host.removeEventListener(type, fn as EventListener);
      stopCutting();
    },
    /** Сторона или режим сменились: жест начинается заново. */
    reset() {
      stopCutting();
      lift();
      forget();
    },
  };
}

export type PointerInput = ReturnType<typeof createPointerInput>;
