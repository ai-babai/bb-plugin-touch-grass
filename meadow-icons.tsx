/** Иконки кнопок луга. Цвет берут из currentColor. */

export function ScytheIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      {/* Длинное косьё с двумя ручками */}
      <path d="M17.5 22.5C16.2 16 14.8 9.5 13.6 2.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M12.9 12.6l3.6-.7M14.4 19.2l3-.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" fill="none" />
      {/* Полотно: широкий серп от пятки к носку, остриём вниз */}
      <path className="tg-blade" d="M14.4 2.2C9.4 1 3.6 3.6 1 10.4C4.4 6.6 8.8 5 13.9 5.2Z" fill="currentColor" />
    </svg>
  );
}

export function MowerIcon() {
  return (
    <svg viewBox="0 0 16 16" width="100%" height="100%" aria-hidden="true">
      <path d="M2 4.5 5.5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M5 9.2h8.5l-1-3H7z" fill="currentColor" />
      <circle cx="6.6" cy="12.2" r="1.7" fill="currentColor" />
      <circle cx="12" cy="12.2" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" width="100%" height="100%" aria-hidden="true">
      <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <circle cx="6" cy="4.5" r="1.6" fill="currentColor" />
      <circle cx="10.5" cy="8" r="1.6" fill="currentColor" />
      <circle cx="5" cy="11.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" width="100%" height="100%" aria-hidden="true">
      <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function SizeIcon({ tall }: { tall: boolean }) {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
      <path
        d={tall ? "M2 11V4M5 11V1.5M8 11V3M11 11V5" : "M2 11V8.5M5 11V7M8 11V8M11 11V9"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
