import { isRegrowPeriod } from "./meadow-prefs";

/**
 * Часы луга треда — одни для всех размеров: высота травы в долях зависит только от
 * реального времени (Date.now), не от ходов и не от того, открыта ли вкладка.
 * Размер луга задаёт лишь максимум и расположение (Grass.tsx).
 *
 * После покоса каждая травинка линейно отрастает от нижней кромки корпуса до своей полной длины за period.
 * start — запуск часов всего луга (первое включение или полный покос).
 * Ручной срез меняет только свой столбец шириной BIN_PX: столбец получает
 * «потолок» в долях полной высоты луга (не отдельной травинки — линия среза ровная),
 * который отрастает с той же скоростью. Хранится «виртуальный старт» потолка,
 * при котором формула даёт высоту среза в момент среза. Травинка не выше ни
 * часов луга, ни потолка столбца, поэтому readyAt = max(start, старты) + period:
 * полная зрелость наступает через period после самого глубокого из последних срезов.
 *
 * Контракт смены периода: текущие высоты сохраняются, оставшийся путь
 * пересчитывается под новый период (старты переносятся к now пропорционально).
 *
 * Хранение: localStorage по threadId, одна запись
 *   { v: 1, p: period мин, s: start мс, c: [[столбец, сдвиг старта от s, с], …] }.
 * Отросшие и перекрытые столбцы выбрасываются; запись — только после покоса
 * (с отсрочкой), смены периода и при уходе со страницы, а не в кадре.
 */

// Смещение сохранённых срезов в формате v1. Высоту корпуса задаёт рисунок косилки.
const CUT_ORIGIN = 0.16;
const BIN_PX = 6;
const SAVE_DELAY_MS = 800;
const MINUTE = 60_000;

type Saved = { v: 1; p: number; s: number; c: [number, number][] };

const keyFor = (threadId: string) => `bb-touch-grass:overgrown:${threadId}`;

function isCut(entry: unknown): entry is [number, number] {
  return Array.isArray(entry) && Number.isSafeInteger(entry[0]) && Number.isSafeInteger(entry[1]);
}

function read(threadId: string): Saved | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(keyFor(threadId)) ?? "null") as Saved | null;
    if (raw?.v !== 1 || !Number.isFinite(raw.s) || !isRegrowPeriod(raw.p) || !Array.isArray(raw.c)) return null;
    return { ...raw, c: raw.c.filter(isCut) };
  } catch {
    return null;
  }
}

/** Без сохранённых часов луг любого размера начинается короткой травой и растёт за period. */
export function createMeadowClock(threadId: string, minutes: number, onReady: (readyAt: number) => void) {
  let period = minutes * MINUTE;
  let start = Date.now();
  let latestStart = start;
  const cuts = new Map<number, number>(); // столбец → виртуальный старт, мс
  let saveTimer = 0;

  const rate = () => (1 - CUT_ORIGIN) / period;

  const save = () => {
    window.clearTimeout(saveTimer);
    saveTimer = 0;
    prune(Date.now());
    const c: [number, number][] = [...cuts].map(([bin, at]) => [bin, Math.round((at - start) / 1000)]);
    try {
      window.localStorage.setItem(keyFor(threadId), JSON.stringify({ v: 1, p: period / MINUTE, s: start, c } satisfies Saved));
    } catch {
      // Без хранилища заросли живут до закрытия чата.
    }
  };
  const saveSoon = () => {
    if (!saveTimer) saveTimer = window.setTimeout(save, SAVE_DELAY_MS);
  };

  /** Столбцы, которые уже отросли или не позже старта луга, ничего не меняют. */
  function prune(now: number) {
    for (const [bin, at] of cuts) if (at <= start || at + period <= now) cuts.delete(bin);
  }

  const readyAt = () => latestStart + period;
  let announced = 0;
  /** Сообщает readyAt наружу, только если срок сдвинулся хотя бы на секунду (косилка режет каждый кадр). */
  const announce = () => {
    const next = readyAt();
    if (Math.abs(next - announced) < 1000) return;
    announced = next;
    onReady(next);
  };

  /** Переносит старты так, чтобы при новом периоде доли на момент now не изменились. */
  const rebase = (from: number, to: number, now: number) => {
    const shift = (at: number) => now - ((now - at) * to) / from;
    start = shift(start);
    latestStart = shift(latestStart);
    for (const [bin, at] of cuts) cuts.set(bin, shift(at));
    period = to;
  };

  const saved = read(threadId);
  if (saved) {
    latestStart = start = saved.s;
    for (const [bin, offset] of saved.c) {
      const at = start + offset * 1000;
      cuts.set(bin, at);
      latestStart = Math.max(latestStart, at);
    }
    period = saved.p * MINUTE;
    if (saved.p !== minutes) {
      rebase(period, minutes * MINUTE, Date.now());
      save();
    }
  } else {
    save(); // часы пошли с первого включения
  }
  announce();

  return {
    /**
     * Доля собственной полной длины (0..1) травинки в точке x, px, с относительной
     * длиной h (Blade.h) на момент now (Date.now).
     */
    share(x: number, h: number, now: number, deckShare: number) {
      const floor = Math.min(1, deckShare / h);
      const grown = floor + (1 - floor) * ((now - start) / period);
      const cap = cuts.get(Math.floor(x / BIN_PX));
      const limit = cap === undefined ? 1 : (CUT_ORIGIN + rate() * (now - cap)) / h;
      const share = Math.min(grown, limit);
      return Math.max(0, Math.min(1, share));
    },
    /** Ручной срез столбца с травинкой x до высоты top в долях полной высоты луга. */
    cut(x: number, top: number, now: number) {
      const bin = Math.floor(x / BIN_PX);
      const at = now - (top - CUT_ORIGIN) / rate();
      if (at <= Math.max(start, cuts.get(bin) ?? start)) return;
      cuts.set(bin, at);
      latestStart = Math.max(latestStart, at);
      saveSoon();
      announce();
    },
    /** Полный покос: часы всего луга начинаются заново, прокосы поглощены. */
    restart(now: number) {
      latestStart = start = now;
      cuts.clear();
      save();
      announce();
    },
    /** «Вырастить сейчас»: весь луг этого чата сразу взрослый, прокосы отросли. */
    growNow(now: number) {
      latestStart = start = now - period;
      cuts.clear();
      save();
      announce();
    },
    setMinutes(next: number) {
      if (next * MINUTE === period) return;
      rebase(period, next * MINUTE, Date.now());
      save();
      announce();
    },
    readyAt,
    /** Сохранить отложенное сразу (уход со страницы, выключение «Зарослей»). */
    flush() {
      if (saveTimer) save();
    },
  };
}

export type MeadowClock = ReturnType<typeof createMeadowClock>;
