import { useEffect, useRef, useState } from "react";
import { Check, Languages } from "lucide-react";
import { LOCALES, LOCALE_NAMES, useT } from "@/lib/i18n";

/** 語言切換：選過的會記在瀏覽器，也會跟著訂閱送給後端，通知信用同一個語言 */
export function LanguageSwitcher() {
  const { t, locale, setLocale } = useT();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t("lang.label")}
        title={t("lang.label")}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-2.5 text-sm text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-accent"
      >
        <Languages className="h-4 w-4" />
        <span className="hidden sm:inline">{LOCALE_NAMES[locale]}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-40 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl">
          {LOCALES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setLocale(item);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              {LOCALE_NAMES[item]}
              {item === locale && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
