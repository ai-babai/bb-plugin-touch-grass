import type { GuestChoice } from "./meadow-visitors";

/**
 * Предпочтения луга, общие для всех чатов: размер и гости.
 * Хранятся в localStorage; без хранилища выбор живёт до закрытия чата.
 */

/** compact и full — высота полосы; overgrown — полоса компактная, а трава растёт над лентой чата. */
export type MeadowSize = "compact" | "full" | "overgrown";
export const MEADOW_SIZES: readonly MeadowSize[] = ["compact", "full", "overgrown"];
export type Guests = GuestChoice;

export const GROWTH_PERIODS = [20, 40, 60] as const;
const PERIOD_KEY = "bb-touch-grass:regrow-minutes";
const SIZE_KEY = "bb-touch-grass:size";
const GUESTS_KEY = "bb-touch-grass:guests";
const COMPACT_SCALE = 0.5; // компактный луг: половина высоты зрелого луга

export const DEFAULT_GUESTS: Guests = { bee: true, butterfly: true };

/** Масштаб полосы у композера. «Заросли» занимают компактную полосу, траву над ней считает движок. */
export function scaleFor(size: MeadowSize): number {
  return size === "full" ? 1 : COMPACT_SCALE;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Без хранилища выбор живёт до закрытия чата.
  }
}

export function loadRegrowMinutes(): number {
  const stored = Number(read(PERIOD_KEY));
  return GROWTH_PERIODS.find(minutes => minutes === stored) ?? 40;
}

export function saveRegrowMinutes(minutes: number) {
  write(PERIOD_KEY, String(minutes));
}

export function loadSize(): MeadowSize {
  const saved = read(SIZE_KEY);
  // Первое открытие — «Заросли»; явно сохранённый выбор (в том числе compact и full) остаётся.
  return MEADOW_SIZES.find(size => size === saved) ?? "overgrown";
}

export function saveSize(size: MeadowSize) {
  write(SIZE_KEY, size);
}

export function parseGuests(raw: string | null): Guests {
  try {
    const value = JSON.parse(raw ?? "{}") as Partial<Guests> | null;
    return { bee: value?.bee !== false, butterfly: value?.butterfly !== false };
  } catch {
    return { ...DEFAULT_GUESTS };
  }
}

export function loadGuests(): Guests {
  return parseGuests(read(GUESTS_KEY));
}

export function saveGuests(guests: Guests) {
  write(GUESTS_KEY, JSON.stringify(guests));
}
