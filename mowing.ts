import type { Blade } from "./blades";
import { type Flower, FLOWER_KINDS, flowerShape } from "./garden";
import { scytheHitsFlower } from "./flower-cut";
import { bladeLength, STUBBLE, visibleBladeHeight } from "./draw-blade";
import { drawMower, tallBoost } from "./meadow-critters";

const SELF_MOW_REACH = 7;
const SCYTHE_MIN_PX = 1.5; // коса срезает почти под корень, косилка оставляет стерню STUBBLE

/** Масштаб косилки: мельче в низкой полосе, крупнее в высоких «Зарослях». */
const mowerScale = (height: number) => Math.max(0.5, Math.min(1, height / 40)) * tallBoost(height);

interface MowingSite {
  readonly width: number;
  readonly height: number;
  readonly bladeHeight: number;
  /** Порог видимости травинок (Blade.appear); взрослый луг показывает все. */
  readonly visibleUpTo: number;
  readonly blades: Blade[];
  readonly flowers: Flower[];
  /** Доля показанного луга: от неё зависит размер головок цветов. */
  readonly shown: number;
  readonly reduced: boolean;
  draw(): void;
  animate(): void;
  regrow(): void;
  markCut(): void;
  onPass(now: number): void;
  onStroke(x: number, now: number): void;
  /** Срез травинки до доли keep её полной длины пишется в часы луга. */
  recordCut(b: Blade, keep: number): void;
  /** Полный проход косилки (или мгновенный покос) завершён. */
  onMowed(): void;
  /** Срезанные цветы: убрать из общего сада и сохранить его. */
  cutFlowers(cut: Flower[]): void;
}

export function createMowing(site: MowingSite) {
  let mower: { x: number; dir: number; start: number; from: number; to: number; speed: number } | null = null;
  let mowDir = 1;
  let selfMowAt: { x: number; y: number } | null = null; // прошлая точка косы, px холста
  const clippings: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];

  /** Срезает травинку до доли keep её полной высоты; ниже лезвия не трогает. */
  const cutBlade = (b: Blade, keep = STUBBLE) => {
    if (b.grown <= keep + 0.04) return false; // уже не выше лезвия
    b.grown = keep;
    site.recordCut(b, keep);
    return true;
  };

  /**
   * Какую долю полной длины травинки оставляет коса на высоте y (сверху холста):
   * верхушка опускается до лезвия, но не ниже SCYTHE_MIN_PX. null — лезвие выше травинки.
   */
  const keepBelow = (b: Blade, y: number) => {
    const top = visibleBladeHeight(b, site.bladeHeight, site.visibleUpTo);
    const blade = site.height - y;
    if (top <= 0 || blade >= top - 0.5) return null;
    const grown = b.grown;
    const fullLength = bladeLength(b, site.bladeHeight, site.visibleUpTo) / grown;
    return Math.min(grown, Math.max(SCYTHE_MIN_PX / fullLength, (grown * Math.max(0, blade)) / top));
  };

  const fling = (x: number, y: number, color: string) => {
    clippings.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 40 - (mower ? mower.dir * 25 : 0),
      vy: -25 - Math.random() * 35,
      life: 0.5 + Math.random() * 0.4,
      color,
    });
  };

  const throwClipping = (b: Blade, x: number) => {
    if (site.reduced || clippings.length > 60 || Math.random() > 0.3) return;
    fling(x, site.height - Math.max(3, site.bladeHeight * b.h * 0.4), b.fill);
  };

  const shapeOf = (f: Flower, now: number) => flowerShape(f, site.width, site.bladeHeight, site.height, site.shown, now);

  /** Убирает цветы из сада; лепестки разлетаются, если движение не уменьшено. */
  const removeFlowers = (cut: Flower[], now: number) => {
    if (!cut.length) return;
    if (!site.reduced) {
      for (const f of cut) {
        const { headX, headY } = shapeOf(f, now);
        for (let i = 0; i < 5; i++) fling(headX, headY, FLOWER_KINDS[f.kind].petal);
      }
    }
    site.cutFlowers(cut);
  };


  const mow = () => {
    if (mower || !site.width) return;
    const now = performance.now();
    site.onPass(now);
    if (site.reduced) {
      removeFlowers(site.flowers.slice(), now); // косилка убирает и цветы на своём пути
      for (const b of site.blades) cutBlade(b);
      site.onMowed();
      site.markCut();
      site.draw();
      site.regrow();
      return;
    }
    const dir = mowDir;
    mowDir = -mowDir; // следующий проход едет навстречу
    const off = 28 * tallBoost(site.height); // начинает и заканчивает проход целиком за краем
    const from = dir > 0 ? -off : site.width + off;
    const to = dir > 0 ? site.width + off : -off;
    const seconds = Math.max(2.2, Math.min(4.5, site.width / 170));
    mower = { x: from, dir, start: now, from, to, speed: (to - from) / seconds / 1000 };
    site.animate();
  };

  const stepMower = (now: number) => {
    if (!mower) return false;
    mower.x = mower.from + mower.speed * (now - mower.start);
    const size = mowerScale(site.height);
    const front = mower.x + mower.dir * 9 * size;
    for (const b of site.blades) {
      if (mower.dir * (b.x - front) > 0) continue;
      if (cutBlade(b)) throwClipping(b, b.x); // пройденная травинка уже у лезвия и не режется снова
    }
    const pass = mower;
    removeFlowers(site.flowers.filter(f => pass.dir * (f.at * site.width - front) <= 0), now);
    site.markCut();
    if (mower.dir * (mower.x - mower.to) >= 0) {
      mower = null;
      site.onMowed();
      site.regrow();
    }
    return true;
  };

  /**
   * Где по горизонтали лежит травинка: от корня до верхушки. Наклонённая травинка
   * может стоять корнем вне прохода, а стеблем в нём — её тоже режем.
   */
  const bladeSpan = (b: Blade, now: number): [number, number] => {
    const tip = b.x + (b.lean + Math.max(-1.15, Math.min(1.15, b.bend)) * 0.8) * bladeLength(b, site.bladeHeight, site.visibleUpTo);
    return [Math.min(b.x, tip), Math.max(b.x, tip)];
  };

  /** Ручной покос: лезвие идёт от прошлой точки к (px, py) и режет на своей высоте. */
  const selfMow = (px: number, py: number, now: number) => {
    const from = selfMowAt ?? { x: px, y: py };
    selfMowAt = { x: px, y: py };
    const lo = Math.min(from.x, px) - SELF_MOW_REACH;
    const hi = Math.max(from.x, px) + SELF_MOW_REACH;
    const span = px - from.x;
    const heightAt = (x: number) => from.y + (py - from.y) * (span ? Math.min(1, Math.max(0, (x - from.x) / span)) : 1);
    const hit = site.flowers.filter(f => scytheHitsFlower(f, shapeOf(f, now), site.height, from, { x: px, y: py }));
    removeFlowers(hit, now);
    let cut = hit.length > 0;
    for (const b of site.blades) {
      const [left, right] = bladeSpan(b, now);
      if (right < lo || left > hi) continue;
      const keep = keepBelow(b, heightAt(Math.max(lo, Math.min(hi, b.x))));
      if (keep !== null && cutBlade(b, keep)) {
        cut = true;
        throwClipping(b, b.x);
      }
    }
    if (!cut) return;
    site.markCut();
    site.onStroke(px, now);
    site.draw();
    site.animate();
    site.regrow();
  };

  const stepClippings = (dt: number) => {
    for (let i = clippings.length - 1; i >= 0; i--) {
      const c = clippings[i];
      c.vy += 140 * dt;
      c.x += c.vx * dt;
      c.y = Math.min(site.height - 1, c.y + c.vy * dt);
      c.life -= dt;
      if (c.life <= 0) clippings.splice(i, 1);
    }
    return clippings.length > 0;
  };


  return {
    mow, selfMow, stepMower, stepClippings,
    get running() { return mower !== null; },
    lift() { selfMowAt = null; },
    finishImmediately() {
      clippings.length = 0;
      if (mower) {
        for (const b of site.blades) cutBlade(b);
        site.cutFlowers([...site.flowers]);
        mower = null;
        site.onMowed();
      }
    },
    paint(ctx: CanvasRenderingContext2D, now: number, dark: boolean) {
      const ground = site.height;
      if (mower) drawMower(ctx, mower.x, ground, mower.dir, mowerScale(site.height), now, dark);
      for (const c of clippings) {
        ctx.globalAlpha = Math.max(0, Math.min(1, c.life * 2));
        ctx.fillStyle = c.color;
        ctx.fillRect(c.x, c.y, 1.6, 1.1);
      }
      ctx.globalAlpha = 1;
    },
  };
}
