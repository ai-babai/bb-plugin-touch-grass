import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { copy } from "./meadow-copy";
import { anchorShare, minutesForKey, minutesFromInput, minutesToUnits, REGROW_ANCHORS, REGROW_MIN, REGROW_MAX, SCALE_UNITS } from "./regrow-scale";
import type { MeadowCardState } from "./useMeadowCard";

/**
 * Часы луга над перевёрнутой карточкой: нативный range выбирает время
 * отрастания — любую целую минуту на шкале с опорами 5 / 15 / 40 / 90 (regrow-scale),
 * ниже — отдельно — сколько осталось до зрелости.
 */

function timeLeft(deadline: number, now: number) {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function useNow(until: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (until <= Date.now()) return;
    const id = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);
  return now;
}

function Status({ readyAt, flowerDeadline, now, onGrowNow }: { readyAt: number; flowerDeadline: number; now: number; onGrowNow(): void }) {
  return (
    <>
      {now >= readyAt ? <span className="tg-timer-status is-grown" role="timer" aria-live="off">{copy.grown}</span> :
      <span className="tg-timer-status" role="timer" aria-live="off">
        <span className="tg-timer-status-label">{copy.timeLeft}</span>
        <span className="tg-timer-clock">{timeLeft(readyAt, now)}</span>
      </span>}
      {now < Math.max(readyAt, flowerDeadline) && <button type="button" className="tg-grow-now" onClick={onGrowNow}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M8 14.5V7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <path d="M8 8.5C8 5.6 6 4 2.8 4 2.8 7 4.8 8.5 8 8.5ZM8 7C8 4 10 2 13.4 2 13.4 5.2 11.2 7 8 7Z" fill="currentColor" />
        </svg>
        {copy.growNow}
      </button>}
    </>
  );
}

export function MeadowTimer({ ui, onGrowNow }: { ui: MeadowCardState; onGrowNow(): void }) {
  const id = useId();
  const now = useNow(Math.max(ui.readyAt, ui.flowerDeadline));
  const minutes = ui.regrowMinutes;
  const units = minutesToUnits(minutes);
  const dragStart = useRef<number | null>(null);
  const fill = `${(units / SCALE_UNITS) * 100}%`;
  // Стрелки — ровно на минуту (деления шкалы мельче минуты), Home/End — края шкалы.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const next = minutesForKey(event.key, minutes);
    if (next === null) return;
    event.preventDefault();
    if (next !== minutes) ui.choosePeriod(next);
  };

  return (
    <div className="tg-timer tg-control" role="group" aria-labelledby={`${id}-label`}>
      <label id={`${id}-label`} htmlFor={`${id}-range`} className="tg-timer-label">
        {copy.regrowth}
        <output htmlFor={`${id}-range`} className="tg-timer-value">{minutes} {copy.mins}</output>
      </label>
      <div className="tg-timer-track">
        <input
          id={`${id}-range`}
          type="range"
          className="tg-range"
          min={0}
          max={SCALE_UNITS}
          step={1}
          value={units}
          aria-valuemin={REGROW_MIN}
          aria-valuemax={REGROW_MAX}
          aria-valuenow={minutes}
          aria-valuetext={`${minutes} ${copy.mins}`}
          style={{ "--tg-fill": fill } as CSSProperties}
          onKeyDown={onKeyDown}
          onPointerDown={() => { dragStart.current = minutes; }}
          onPointerUp={() => { dragStart.current = null; }}
          onPointerCancel={() => {
            // A vertical swipe scrolls the chat. Undo any track jump from the initial touch.
            if (dragStart.current !== null && dragStart.current !== minutes) ui.choosePeriod(dragStart.current);
            dragStart.current = null;
          }}
          onLostPointerCapture={() => { dragStart.current = null; }}
          onChange={event => {
            const next = minutesFromInput(Number(event.target.value), minutes, dragStart.current !== null);
            if (next !== minutes) ui.choosePeriod(next);
          }}
        />
        <div className="tg-timer-scale" aria-hidden="true">
          {REGROW_ANCHORS.map((value, i) => (
            <span key={value} className={value === minutes ? "is-current" : undefined} style={{ left: `${anchorShare(i) * 100}%` }}>{value}</span>
          ))}
        </div>
      </div>
      {/* Время до зрелости и действие — отдельной строкой от выбранной длительности. */}
      <div className="tg-timer-foot">
        <Status readyAt={ui.readyAt} flowerDeadline={ui.flowerDeadline} now={now} onGrowNow={onGrowNow} />
      </div>
    </div>
  );
}
