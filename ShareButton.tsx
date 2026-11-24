import { copy } from "./meadow-copy";
import { DoneIcon, ShareIcon } from "./meadow-icons";
import { type KeyboardEvent, useEffect, useState } from "react";

/** Страница Touch Grass в маркете BB: делимся установкой расширения, а не чатом. */
export const SHARE_URL = "https://getbb.app/marketplace/touch-grass";

/** idle — ничего не показываем (успех или отмена системного меню); manual — ссылка для ручного копирования. */
type Outcome = "idle" | "copied" | "manual";

/** Старый способ копирования: работает и без защищённого контекста, если вызван в жесте. */
function copyBySelection(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.append(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

async function copyLink(nav: Navigator): Promise<Outcome> {
  if (nav.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(SHARE_URL);
      return "copied";
    } catch { /* ниже — запасные пути */ }
  }
  return copyBySelection(SHARE_URL) ? "copied" : "manual";
}

/** Системное меню «Поделиться». null — меню нет или оно сломалось, тогда копируем сами. */
async function nativeShare(nav: Navigator): Promise<Outcome | null> {
  if (typeof nav.share !== "function") return null;
  try {
    await nav.share({ title: "Touch Grass", url: SHARE_URL });
    return "idle";
  } catch (error) {
    return (error as Error)?.name === "AbortError" ? "idle" : null; // отмена — тишина, без «готово»
  }
}

/** Меню, если есть; иначе копирование; если не вышло ничего — показываем ссылку. */
export async function shareMeadow(nav: Navigator = navigator): Promise<Outcome> {
  return (await nativeShare(nav)) ?? copyLink(nav);
}

/** Кнопка без подписи в строке настроек, перед «назад». Итог копирования слышит и диктор. */
export function ShareButton() {
  const [outcome, setOutcome] = useState<Outcome>("idle");
  useEffect(() => {
    if (outcome !== "copied") return;
    const timer = setTimeout(() => setOutcome("idle"), 1500);
    return () => clearTimeout(timer);
  }, [outcome]);
  const closeOnEsc = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation(); // Esc закрывает только ссылку, настройки остаются
    setOutcome("idle");
  };
  return (
    <>
      {outcome === "manual" && (
        <input
          className="tg-share-link"
          readOnly
          value={SHARE_URL}
          aria-label={copy.copyManually}
          title={copy.copyManually}
          autoFocus
          onFocus={event => event.currentTarget.select()}
          onBlur={() => setOutcome("idle")}
          onKeyDown={closeOnEsc}
        />
      )}
      <button
        type="button"
        className="tg-button tg-control tg-share"
        aria-label={copy.share}
        title={copy.share}
        onClick={() => void shareMeadow().then(setOutcome)}
      >
        <span className="tg-icon">{outcome === "copied" ? <DoneIcon /> : <ShareIcon />}</span>
      </button>
      <span className="tg-sr" role="status">{outcome === "copied" ? copy.copied : ""}</span>
    </>
  );
}
