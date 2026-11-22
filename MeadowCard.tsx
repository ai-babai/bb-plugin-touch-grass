import { MeadowTimer } from "./MeadowTimer";
import { copy } from "./meadow-copy";
import { type CSSProperties, type ReactNode, type RefObject, useId } from "react";
import { BackIcon, MowerIcon, ScytheIcon, SettingsIcon, SizeIcon } from "./meadow-icons";
import type { Guests, MeadowSize } from "./meadow-prefs";
import type { MeadowCardState } from "./useMeadowCard";

/**
 * Разметка луга: оболочка, карточка с двумя сторонами и кнопки.
 * Кнопка настроек/«назад» одна и живёт на оболочке, привязанная к правому
 * нижнему углу, — при перевороте и смене высоты полосы её центр не сдвигается.
 */

const SIZE_OPTIONS: { value: MeadowSize; label: string }[] = [
  { value: "compact", label: copy.compact },
  { value: "full", label: copy.full },
  { value: "overgrown", label: copy.overgrown },
];

const GUEST_OPTIONS: { value: keyof Guests; label: string; icon: string }[] = [
  { value: "bee", label: copy.bee, icon: "🐝" },
  { value: "butterfly", label: copy.butterfly, icon: "🦋" },
];

type Props = {
  ui: MeadowCardState;
  hostRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Высота полосы травы, px. */
  box: number;
  onMow(): void;
  /** «Заросли»: сразу дорастить луг до зрелости. */
  onGrowNow(): void;
};

function shellClass(ui: MeadowCardState) {
  return ["tg-meadow", ui.flipped && "is-flipped", ui.scythe && "is-scything", ui.size === "overgrown" && "is-overgrown"]
    .filter(Boolean)
    .join(" ");
}

export function MeadowCard({ ui, hostRef, canvasRef, box, onMow, onGrowNow }: Props) {
  const backId = useId();
  // Вырастить и сразу показать луг: карточка переворачивается обратно.
  const growNow = () => {
    onGrowNow();
    ui.toggleSettings();
    ui.toggleRef.current?.focus({ preventScroll: true }); // кнопка действия исчезает вместе с панелью
  };
  return (
    <div
      ref={hostRef}
      className={shellClass(ui)}
      data-no-sidebar-swipe=""
      data-no-secondary-panel-swipe=""
      role="group"
      aria-label={copy.meadow}
      style={{ "--tg-box": `${box}px` } as CSSProperties}
      onKeyDown={ui.onKeyDown}
    >
      <div className="tg-card">
        <MeadowFront ui={ui} canvasRef={canvasRef} onMow={onMow} />
        <MeadowSettings ui={ui} id={backId} />
      </div>
      {ui.flipped && ui.size === "overgrown" && <MeadowTimer ui={ui} onGrowNow={growNow} />}
      <SettingsToggle ui={ui} controls={backId} />
    </div>
  );
}

function MeadowFront({ ui, canvasRef, onMow }: Pick<Props, "ui" | "canvasRef" | "onMow">) {
  const scytheTitle = ui.scythe
    ? copy.usingScythe
    : copy.takeScythe;
  return (
    <div
      className="tg-face tg-front"
      aria-hidden={ui.flipped || undefined}
      inert={ui.flipped}
      title={ui.scythe ? undefined : copy.brush}
    >
      <canvas ref={canvasRef} className="tg-canvas" aria-hidden="true" />
      {/* Заросли: ловит указатель только над стоящей травой (clip-path по профилю). */}
      <div className="tg-hit" aria-hidden="true" />
      <button
        ref={ui.scytheRef}
        type="button"
        className="tg-button tg-control tg-scythe"
        aria-label={copy.scythe}
        aria-pressed={ui.scythe}
        title={scytheTitle}
        onClick={ui.toggleScythe}
      >
        <span className="tg-icon tg-icon-scythe"><ScytheIcon /></span>
      </button>
      <button
        type="button"
        className="tg-button tg-control tg-mow"
        aria-label={copy.mower}
        title={copy.mower}
        onClick={onMow}
      >
        <span className="tg-icon"><MowerIcon /></span>
      </button>
    </div>
  );
}

/** Одна кнопка на обе стороны: открывает настройки и возвращает к лугу. */
function SettingsToggle({ ui, controls }: { ui: MeadowCardState; controls: string }) {
  const label = ui.flipped ? copy.back : copy.settings;
  return (
    <button
      ref={ui.toggleRef}
      type="button"
      className="tg-button tg-control tg-toggle"
      aria-label={label}
      title={ui.flipped ? `${label} (Esc)` : label}
      aria-expanded={ui.flipped}
      aria-controls={controls}
      onClick={ui.toggleSettings}
    >
      <span className="tg-icon">{ui.flipped ? <BackIcon /> : <SettingsIcon />}</span>
    </button>
  );
}

function MeadowSettings({ ui, id }: { ui: MeadowCardState; id: string }) {
  return (
    <div
      id={id}
      className="tg-face tg-back"
      role="group"
      aria-label={copy.settings}
      aria-hidden={!ui.flipped || undefined}
      inert={!ui.flipped}
    >
      <SettingGroup caption={copy.size} label={copy.sizeGroup}>
        {SIZE_OPTIONS.map(option => (
          <Chip
            key={option.value}
            pressed={ui.size === option.value}
            label={`${copy.size}: ${option.label.toLowerCase()}`}
            title={option.label}
            onClick={() => ui.chooseSize(option.value)}
            icon={<SizeIcon size={option.value} />}
            text={option.label}
          />
        ))}
      </SettingGroup>
      <SettingGroup caption={copy.guests} label={copy.guestGroup}>
        {GUEST_OPTIONS.map(option => (
          <Chip
            key={option.value}
            guest
            pressed={ui.guests[option.value]}
            label={option.label}
            title={`${option.label}: ${ui.guests[option.value] ? copy.visiting : copy.away}`}
            onClick={() => ui.toggleGuest(option.value)}
            icon={<span aria-hidden="true">{option.icon}</span>}
            text={option.label}
          />
        ))}
      </SettingGroup>
    </div>
  );
}

function SettingGroup({ caption, label, children }: { caption: string; label: string; children: ReactNode }) {
  return (
    <div className="tg-set" role="group" aria-label={label}>
      <span className="tg-caption" aria-hidden="true">{caption}</span>
      {children}
    </div>
  );
}

type ChipProps = {
  pressed: boolean;
  label: string;
  title: string;
  icon: ReactNode;
  text: string;
  guest?: boolean;
  onClick(): void;
};

function Chip({ pressed, label, title, icon, text, guest, onClick }: ChipProps) {
  return (
    <button
      type="button"
      className={guest ? "tg-chip tg-guest" : "tg-chip"}
      aria-pressed={pressed}
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      {icon}
      <span className="tg-chip-label" aria-hidden="true">{text}</span>
    </button>
  );
}
