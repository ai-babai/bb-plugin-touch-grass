import type { GuestChoice } from "./meadow-visitors";

/**
 * Предпочтения луга, общие для всех чатов: размер и гости.
 * Хранятся в localStorage; без хранилища выбор живёт до закрытия чата.
 */

export type MeadowSize = "compact" | "full";
export type Guests = GuestChoice;

const SIZE_KEY = "bb-touch-grass:size";
const GUESTS_KEY = "bb-touch-grass:guests";
const COMPACT_SCALE = 0.5; // компактный луг: половина высоты зрелого луга

export const DEFAULT_GUESTS: Guests = { bee: true, butterfly: true };

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

export function loadSize(): MeadowSize {
  return read(SIZE_KEY) === "full" ? "full" : "compact";
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
