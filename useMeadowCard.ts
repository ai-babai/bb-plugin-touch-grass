import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { type Guests, loadGuests, loadSize, loadRegrowMinutes, saveRegrowMinutes, type MeadowSize, saveGuests, saveSize } from "./meadow-prefs";

/**
 * Состояние карточки луга: сторона (трава/настройки), режим косы и предпочтения.
 * Настройки открывает и закрывает одна и та же кнопка, поэтому фокус остаётся
 * в той же точке; Esc закрывает настройки, а на траве — снимает режим косы.
 */
export function useMeadowCard() {
  const [size, setSize] = useState<MeadowSize>(loadSize);
  const [guests, setGuests] = useState<Guests>(loadGuests);
  const [regrowMinutes, setRegrowMinutes] = useState(loadRegrowMinutes);
  const [readyAt, setReadyAt] = useState(0);
  const choosePeriod = (minutes: number) => {
    setRegrowMinutes(minutes);
    saveRegrowMinutes(minutes);
  };
  const [flipped, setFlipped] = useState(false);
  const [scythe, setScythe] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const scytheRef = useRef<HTMLButtonElement>(null);

  const chooseSize = (next: MeadowSize) => {
    saveSize(next);
    setSize(next);
  };

  const toggleGuest = (kind: keyof Guests) => {
    const next = { ...guests, [kind]: !guests[kind] };
    saveGuests(next);
    setGuests(next);
  };

  const toggleSettings = () => {
    setScythe(false); // на обороте косить нечего
    setFlipped(open => !open);
  };

  const toggleScythe = () => setScythe(on => !on);

  /** Esc внутри луга: сначала закрывает настройки, затем снимает косу. */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || (!flipped && !scythe)) return;
    event.preventDefault();
    event.stopPropagation(); // Esc не уходит в чат
    if (flipped) {
      setFlipped(false);
      toggleRef.current?.focus({ preventScroll: true });
    } else {
      setScythe(false);
      scytheRef.current?.focus({ preventScroll: true });
    }
  };

  // Коса включена мышью, а фокус ни на чём: Esc всё равно её снимает.
  useEffect(() => {
    if (!scythe) return;
    const onDocumentKey = (event: KeyboardEvent) => {
      const idle = !document.activeElement || document.activeElement === document.body;
      if (event.key === "Escape" && idle) setScythe(false);
    };
    document.addEventListener("keydown", onDocumentKey);
    return () => document.removeEventListener("keydown", onDocumentKey);
  }, [scythe]);

  return {
    size, chooseSize, guests, toggleGuest,
    regrowMinutes, choosePeriod, readyAt, setReadyAt,
    flipped, toggleSettings, toggleRef,
    scythe, toggleScythe, scytheRef,
    onKeyDown,
  };
}

export type MeadowCardState = ReturnType<typeof useMeadowCard>;
