import { gardenCapacity, type Flower } from "./garden";

const FIREFLY_REACH = 40; // светлячок чувствует движение только рядом, px
const WAKE_AT = 320; // сколько «поглаженных» пикселей нужно, чтобы разбудить
const FADE_PER_S = 55; // без поглаживания светлячок снова засыпает
const FLY_MS = 1600;

interface Habitat {
  element: HTMLElement;
  read(): { width: number; growth: number; full: number; reduced: boolean; flowers: Flower[] };
  onBloom(x: number): void;
}

// Keep sleeping fireflies in the part of the meadow a finger can actually brush.
function playableStrip(element: HTMLElement, width: number) {
  const scythe = element.querySelector<HTMLButtonElement>(".tg-scythe");
  const mower = element.querySelector<HTMLButtonElement>(".tg-mow");
  const left = scythe ? scythe.offsetLeft + scythe.offsetWidth : 0;
  const right = mower ? mower.offsetLeft : width;
  return { left: left + 6, right: right - 6 };
}

function openSpot(flowers: Flower[], width: number, left: number, right: number) {
  const occupied = flowers.map(f => f.at * width).filter(x => x > left && x < right);
  const positions = [left, ...occupied.sort((a, b) => a - b), right];
  let gap = 0;
  let start = left;
  for (let i = 1; i < positions.length; i++) {
    const size = positions[i] - positions[i - 1];
    if (size > gap) { gap = size; start = positions[i - 1]; }
  }
  return start + gap * (0.2 + 0.6 * Math.random());
}

export function createFireflies(host: Habitat) {
  let disposed = false;
  let firefly: { x: number; energy: number; updated: number; waking: boolean } | null = null;
  let spawnTimer = 0;
  let wakeTimer = 0;
  let fadeTimer = 0;
  // --- Светлячок -------------------------------------------------------
  const flyEl = document.createElement("div");
  flyEl.className = "tg-firefly";
  flyEl.innerHTML = '<div class="tg-firefly-pulse"><div class="tg-firefly-glow"></div></div>';
  host.element.appendChild(flyEl);

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
    const { width, flowers, growth } = host.read();
    if (disposed || firefly || width < 60 || flowers.length >= gardenCapacity(growth)) return;
    const { left, right } = playableStrip(host.element, width);
    if (right <= left) return;
    const x = openSpot(flowers, width, left, right);
    firefly = { x, energy: 0, updated: performance.now(), waking: false };
    flyEl.classList.remove("is-waking");
    showEnergy();
    placeFirefly(host.read().full);
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
    host.onBloom(fly.x);
    wakeTimer = window.setTimeout(() => {
      wakeTimer = 0;
      firefly = null;
      flyEl.classList.remove("is-on", "is-waking");
      showEnergy();
      queueFirefly(3500 + Math.random() * 3000);
    }, host.read().reduced ? 900 : FLY_MS);
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


  return {
    place: placeFirefly,
    feed: feedFirefly,
    queue: queueFirefly,
    get sleeping() { return firefly !== null && !firefly.waking; },
    resize(width: number) {
      if (!firefly || firefly.waking) return;
      const { left, right } = playableStrip(host.element, width);
      firefly.x = Math.max(left, Math.min(right, firefly.x));
    },
    dispose() {
      disposed = true;
      clearTimeout(spawnTimer);
      clearTimeout(wakeTimer);
      stopFade();
      flyEl.remove();
      firefly = null;
    },
  };
}
