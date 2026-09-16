import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { CITIES, cityOf, matchCity, type City } from "@/lib/cities";
import { useT } from "@/lib/i18n";

/**
 * 城市選擇器 —— 可搜尋的下拉，中文名／英文名／IATA 代碼都能打。
 * 清單裡沒有的城市，直接把三碼代碼打進搜尋框也能選。
 */
export function CityPicker({
  value,
  onChange,
  label,
  exclude,
}: {
  value: string;
  onChange: (code: string) => void;
  label: string;
  /** 另一端已經選的城市，不讓使用者選成同一個 */
  exclude?: string;
}) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = cityOf(value);

  // 點到外面或按 Esc 就收起來
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

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setKeyword("");
  }, [open]);

  const groups = useMemo(() => {
    const result: { area: string; cities: City[] }[] = [];
    for (const city of CITIES) {
      if (city.code === exclude) continue;
      if (!matchCity(city, keyword)) continue;
      const last = result[result.length - 1];
      if (last?.area === city.area) last.cities.push(city);
      else result.push({ area: city.area, cities: [city] });
    }
    return result;
  }, [keyword, exclude]);

  // 清單裡找不到，但打了合法的三碼代碼 -> 讓他直接用
  const rawCode = keyword.trim().toUpperCase();
  const customCode =
    /^[A-Z]{3}$/.test(rawCode) && !cityOf(rawCode) && rawCode !== exclude
      ? rawCode
      : null;

  function pick(code: string) {
    onChange(code);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2.5 text-left transition-colors hover:border-primary/40"
      >
        <span className="min-w-0">
          <span className="block truncate text-base text-foreground">
            {selected ? selected.name[locale] : value || t("picker.select")}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {selected
              ? `${selected.name.en} · ${selected.code}`
              : value
                ? t("picker.custom")
                : t("picker.hint")}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t("picker.search")}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-72 overflow-y-auto overscroll-contain py-1">
            {customCode && (
              <button
                type="button"
                onClick={() => pick(customCode)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <span className="text-foreground">
                  {t("picker.useCode", { code: customCode })}
                </span>
                <span className="text-xs text-muted-foreground">{t("picker.customTag")}</span>
              </button>
            )}

            {groups.map((group) => (
              <div key={group.area}>
                <p className="px-3 pb-1 pt-2.5 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                  {t(`area.${group.area}`)}
                </p>
                {group.cities.map((city) => (
                  <button
                    key={city.code}
                    type="button"
                    onClick={() => pick(city.code)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="text-sm text-foreground">
                        {city.name[locale]}
                      </span>
                      {city.name[locale] !== city.name.en && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {city.name.en}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">{city.code}</span>
                      {city.code === value && <Check className="h-3.5 w-3.5 text-primary" />}
                    </span>
                  </button>
                ))}
              </div>
            ))}

            {!customCode && groups.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("picker.notFound", { keyword })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
