/**
 * Посетители луга: пчела у цветов и бабочка над травой.
 *
 * Модуль владеет выбором гостя, жизненным циклом (прилёт, полёт, посадка,
 * испуг, отлёт) и рисованием. Полёт — «рулевое» движение с ограниченным
 * ускорением: скорость меняется плавно, поэтому повороты получаются дугами,
 * а у цели гость сам замедляется. Порхание — только смещение при отрисовке,
 * в траекторию оно не попадает.
 */
import { BUTTERFLY_PALETTES, drawBee, drawButterfly, type VisitorKind } from "./meadow-critters";

export type GuestChoice = { bee: boolean; butterfly: boolean };
export type Point = { x: number; y: number };

/** Что модулю нужно знать о луге. Всё читается лениво, в момент вызова. */
export type VisitorHost = {
  /** Ширина и высота полосы и текущая высота травы, px. */
  bounds(): { width: number; height: number; meadow: number };
  /** Головки цветов по индексам; undefined — цветок ещё не нарисован. */
  flowerHeads(): (Point | undefined)[];
  /** Активность инструментов 0..1 или undefined. */
  activity(): number | undefined;
  guests(): GuestChoice;
  /** Можно ли прилетать сейчас: вкладка видна, луг не перевёрнут, косилка не едет. */
  canArrive(): boolean;
  reduced(): boolean;
  /** Пчела села на цветок; animate=false — без анимации (уменьшенное движение). */
  pollinate(flower: number, animate: boolean): void;
  /** Попросить кадры анимации. */
  animate(): void;
  /** Одна статичная перерисовка (без анимации). */
  redraw(): void;
};

type Mode = "fly" | "land" | "sit" | "leave";

type Flight = {
  kind: VisitorKind;
  palette: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  mode: Mode;
  until: number; // конец посадки
  leaveAt: number;
  flower: number; // цветок пчелы, -1 — нет
  flap: number; // фаза крыльев, рад
  glideUntil: number;
  flapUntil: number;
  scaredAt: number;
  face: number;
};

type Gait = { speed: number; accel: number; slow: number };

export const FIRST_VISITOR_MS = 6000;
const SCARE_RADIUS = 26;
const EDGE = 14;
const STAY_MS = 20_000;
const STILL_MS = 15_000;
const SCARE_DECAY_MS = 700;

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function flightBand(height: number, meadow: number) {
  const top = Math.min(8, height * 0.3);
  return { top, bottom: Math.max(top + 2, height - Math.max(4, meadow * 0.45)) };
}

/** Темп пчелы: 0.5..1.5 от активности инструментов. */
function beeTempo(activity: number | undefined) {
  return 0.5 + (activity ?? 0.35);
}

function gaitOf(v: Flight, activity: number | undefined, now: number): Gait {
  const fright = 1 + 1.3 * Math.exp(-(now - v.scaredAt) / SCARE_DECAY_MS);
  if (v.kind === "bee") {
    const tempo = beeTempo(activity);
    return { speed: 55 * tempo * fright, accel: 170 * tempo * fright, slow: 18 };
  }
  return { speed: 30 * fright, accel: 42 * fright, slow: v.mode === "land" ? 26 : 14 };
}

/** Рулевой шаг: к цели с ограниченным ускорением и плавным торможением у цели. */
function steer(v: Flight, gait: Gait, dt: number) {
  const dx = v.tx - v.x;
  const dy = v.ty - v.y;
  const dist = Math.hypot(dx, dy);
  const want = dist > 1e-3 ? (gait.speed * Math.min(1, dist / gait.slow)) / dist : 0;
  let ax = dx * want - v.vx;
  let ay = dy * want - v.vy;
  const pull = Math.hypot(ax, ay);
  const limit = gait.accel * dt;
  if (pull > limit) {
    ax *= limit / pull;
    ay *= limit / pull;
  }
  v.vx += ax;
  v.vy += ay;
  v.x += v.vx * dt;
  v.y += v.vy * dt;
  if (v.vx > 4) v.face = 1; // гистерезис: не разворачиваемся на каждом кадре
  else if (v.vx < -4) v.face = -1;
  return dist;
}

/** Следующая точка впереди по курсу: отклонение до ±65°, отскок от краёв. */
function aheadTarget(v: Flight, width: number, band: { top: number; bottom: number }) {
  const heading = Math.hypot(v.vx, v.vy) > 1 ? Math.atan2(v.vy, v.vx) : v.face > 0 ? 0 : Math.PI;
  let angle = heading + rand(-1.13, 1.13);
  const reach = rand(50, 110);
  let x = v.x + Math.cos(angle) * reach;
  if (x < 12 || x > width - 12) {
    angle = Math.PI - angle; // повернуть обратно — дугой, т.к. ускорение ограничено
    x = v.x + Math.cos(angle) * reach;
  }
  v.tx = clamp(x, 12, width - 12);
  v.ty = clamp(v.y + Math.sin(angle) * reach * 0.35, band.top, band.bottom);
}

function speedOf(v: Flight) {
  return Math.hypot(v.vx, v.vy);
}

/** Толчок к текущей цели с небольшим подъёмом. */
function kickToward(v: Flight, speed: number) {
  const dx = v.tx - v.x;
  const dy = v.ty - v.y - 6;
  const dist = Math.hypot(dx, dy) || 1;
  v.vx = (dx / dist) * speed;
  v.vy = (dy / dist) * speed;
}

export function createVisitors(host: VisitorHost) {
  let v: Flight | null = null;
  let timer = 0;
  let disposed = false;

  const clearTimer = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };

  const queue = (delay: number) => {
    if (disposed || v || timer) return;
    timer = window.setTimeout(arrive, delay);
  };

  const gone = (next: number) => {
    v = null;
    clearTimer();
    queue(next);
  };

  const pickFlower = (except: number) => {
    const heads = host.flowerHeads();
    const choices = heads.flatMap((head, i) => (head && i !== except ? [i] : []));
    if (choices.length) return choices[Math.floor(Math.random() * choices.length)];
    return heads[except] ? except : -1;
  };

  const chooseKind = (): VisitorKind | null => {
    const guests = host.guests();
    const hasFlowers = host.flowerHeads().some(Boolean);
    const beeChance = hasFlowers ? 0.4 + 0.5 * (host.activity() ?? 0.3) : 0;
    let kind: VisitorKind = Math.random() < beeChance ? "bee" : "butterfly";
    if (!guests[kind]) kind = kind === "bee" ? "butterfly" : "bee";
    if (!guests[kind] || (kind === "bee" && !hasFlowers)) return null;
    return kind;
  };

  const spawn = (kind: VisitorKind, now: number): Flight => {
    const { width, height, meadow } = host.bounds();
    const band = flightBand(height, meadow);
    const fromLeft = Math.random() < 0.5;
    const face = fromLeft ? 1 : -1;
    return {
      kind,
      palette: Math.floor(Math.random() * BUTTERFLY_PALETTES.length),
      x: fromLeft ? -10 : width + 10,
      y: rand(band.top, band.bottom),
      vx: face * 20, // влетает уже в движении, без рывка с места
      vy: 0,
      tx: 0,
      ty: 0,
      mode: "fly",
      until: 0,
      leaveAt: now + STAY_MS + Math.random() * 15_000,
      flower: -1,
      flap: 0,
      glideUntil: 0,
      flapUntil: now + 600,
      scaredAt: -1e9,
      face,
    };
  };

  /** Без движения: гость тихо сидит на цветке или траве и через время исчезает. */
  const settleStill = (f: Flight) => {
    const { width, height, meadow } = host.bounds();
    f.flower = f.kind === "bee" ? pickFlower(-1) : -1;
    const head = host.flowerHeads()[f.flower];
    if (head) host.pollinate(f.flower, false);
    f.mode = "sit";
    f.vx = f.vy = 0;
    f.x = head ? head.x : rand(20, Math.max(21, width - 20));
    f.y = head ? head.y - 2 : height - Math.max(5, meadow * 0.8);
    f.flap = Math.PI / 2.5;
    clearTimer();
    timer = window.setTimeout(() => {
      timer = 0;
      v = null;
      host.redraw();
      queue(20_000 + Math.random() * 20_000);
    }, STILL_MS);
  };

  const planNext = (f: Flight) => {
    const { width, height, meadow } = host.bounds();
    if (f.kind === "bee") {
      f.flower = pickFlower(f.flower);
      f.mode = f.flower >= 0 ? "land" : "fly";
      if (f.flower < 0) aheadTarget(f, width, flightBand(height, meadow));
      return;
    }
    if (Math.random() < 0.3) {
      // Бабочка присматривает травинку впереди и садится на неё.
      f.mode = "land";
      f.tx = clamp(f.x + f.face * rand(40, 90), 12, width - 12);
      f.ty = height - Math.max(5, meadow * 0.75);
      return;
    }
    f.mode = "fly";
    aheadTarget(f, width, flightBand(height, meadow));
  };

  function arrive() {
    timer = 0;
    if (disposed || v) return;
    const kind = chooseKind();
    if (!kind) return; // нужный гость выключен; setGuests позовёт снова
    if (!host.canArrive() || host.bounds().width < 120) {
      queue(15_000);
      return;
    }
    v = spawn(kind, performance.now());
    if (host.reduced()) {
      settleStill(v);
      host.redraw();
      return;
    }
    planNext(v);
    host.animate();
  }

  const leave = (now: number, hurry = false) => {
    if (!v || v.mode === "leave") return;
    const { width } = host.bounds();
    v.mode = "leave";
    v.flower = -1;
    v.tx = v.x < width / 2 ? -EDGE - 6 : width + EDGE + 6;
    v.ty = Math.max(2, v.y - 6);
    if (hurry) v.scaredAt = now;
    host.animate();
  };

  const scare = (px: number, py: number, now: number) => {
    if (!v || host.reduced() || v.mode === "leave") return;
    if (Math.hypot(v.x - px, v.y - py) > SCARE_RADIUS) return;
    const { width, height, meadow } = host.bounds();
    const band = flightBand(height, meadow);
    const wasSitting = v.mode === "sit";
    v.scaredAt = now;
    if (v.kind === "bee" && host.flowerHeads().filter(Boolean).length > 1) {
      v.flower = pickFlower(v.flower);
      v.mode = "land";
      trackFlower(v);
    } else {
      v.mode = "fly";
      v.flower = -1;
      const away = v.x < px ? -1 : 1;
      v.tx = clamp(px + away * rand(70, 120), 12, width - 12);
      v.ty = band.top + (band.bottom - band.top) * 0.3;
    }
    if (wasSitting) kickToward(v, 12); // взлёт сразу по новому курсу, без разворота на месте
    host.animate();
  };

  const stepFlap = (f: Flight, now: number, dt: number) => {
    if (f.kind === "bee") {
      f.flap += dt * 40;
      return;
    }
    if (f.mode === "sit") {
      f.flap += dt * 1.4; // на травинке крылья медленно складываются и раскрываются
      return;
    }
    // Бабочка: серия взмахов, затем короткое планирование.
    if (now > f.flapUntil && now > f.glideUntil && f.vy > -6) {
      f.glideUntil = now + rand(250, 450);
      f.flapUntil = f.glideUntil + rand(500, 900);
    }
    f.flap += dt * (now < f.glideUntil ? 2.5 : 13);
  };

  const sit = (f: Flight, now: number) => {
    const tempo = f.kind === "bee" ? beeTempo(host.activity()) : 1;
    f.mode = "sit";
    f.vx = f.vy = 0;
    f.until = now + (f.kind === "bee" ? rand(2600, 5000) / tempo : rand(1800, 4000));
    if (f.kind === "bee" && f.flower >= 0) host.pollinate(f.flower, true);
  };

  const stepSit = (f: Flight, now: number, dt: number) => {
    const head = f.kind === "bee" ? host.flowerHeads()[f.flower] : undefined;
    const ease = Math.min(1, dt * 14);
    const tx = head ? head.x : f.tx;
    const ty = head ? head.y - 2 : f.ty;
    f.x += (tx - f.x) * ease; // мягко усаживается и качается вместе с цветком
    f.y += (ty - f.y) * ease;
    if (now <= f.until) return;
    planNext(f);
    kickToward(f, 8); // мягкий взлёт в сторону новой цели
  };

  function trackFlower(f: Flight) {
    const head = host.flowerHeads()[f.flower];
    if (!head) {
      planNext(f);
      return;
    }
    f.tx = head.x;
    f.ty = head.y - 2;
  }

  const stepAir = (f: Flight, now: number, dt: number) => {
    if (f.kind === "bee" && f.mode === "land") trackFlower(f);
    const dist = steer(f, gaitOf(f, host.activity(), now), dt);
    const { width } = host.bounds();
    if (f.mode === "leave") {
      if (f.x < -EDGE || f.x > width + EDGE) gone(15_000 + rand(0, 20_000) / beeTempo(host.activity()));
      return;
    }
    if (f.mode === "land") {
      if (dist < 1.5 && speedOf(f) < 8) sit(f, now); // остаток пути доберёт посадка
      return;
    }
    if (dist < 12) planNext(f); // новая точка до прибытия — полёт без остановок
  };

  /** Шаг симуляции. true — нужен следующий кадр. */
  const step = (now: number, dt: number) => {
    const f = v;
    if (!f || host.reduced()) return false;
    if (f.mode !== "leave" && now > f.leaveAt) leave(now);
    stepFlap(f, now, dt);
    if (f.mode === "sit") stepSit(f, now, dt);
    else stepAir(f, now, dt);
    return true;
  };

  /** Порхание: вертикальное смещение только для отрисовки, гаснет при посадке. */
  const flutterOffset = (f: Flight, now: number) => {
    if (f.mode === "sit") return 0;
    const lively = Math.min(1, speedOf(f) / 20);
    if (f.kind === "bee") return Math.sin(now * 0.012) * 0.6 * lively;
    return -Math.sin(f.flap) * (now < f.glideUntil ? 0.2 : 1) * lively;
  };

  const draw = (ctx: CanvasRenderingContext2D, now: number, dark: boolean) => {
    const f = v;
    if (!f) return;
    const scale = clamp(host.bounds().height / 36, 0.75, 1.2);
    const y = f.y + flutterOffset(f, now);
    if (f.kind === "bee") drawBee(ctx, f.x, y, now, f.face, f.mode === "sit", scale, dark);
    else drawButterfly(ctx, f.x, y, f.flap, f.palette, scale, dark);
  };

  return {
    queue,
    step,
    draw,
    scare,
    leave,
    /** Гость рядом с точкой по горизонтали. */
    near: (x: number, radius: number) => !!v && Math.abs(v.x - x) < radius,
    present: () => v !== null,
    /** Изменился выбор гостей: убрать выключенного, позвать разрешённого. */
    guestsChanged() {
      if (v && !host.guests()[v.kind]) {
        v = null;
        clearTimer();
        host.redraw();
      }
      queue(2500);
    },
    /** Включили «уменьшить движение»: гость замирает и потом исчезает. */
    reducedChanged() {
      if (v && host.reduced()) settleStill(v);
      else if (v) host.animate();
    },
    dispose() {
      disposed = true;
      clearTimer();
      v = null;
    },
    /** Только для оценки траектории: текущее состояние без копирования. */
    peek: () => v as Readonly<Flight> | null,
  };
}

export type Visitors = ReturnType<typeof createVisitors>;
