import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

/** 深色是預設；使用者沒選過就跟系統走。初值由 index.html 的 script 先寫進 data-theme */
function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset["theme"] === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  // 只在瀏覽器端讀，避免 SSR 與第一次繪製對不起來
  useEffect(() => setTheme(currentTheme()), []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset["theme"] = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // 無痕模式寫不進去就算了，這輪切換仍然有效
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? "切換到深色" : "切換到淺色"}
      title={theme === "light" ? "切換到深色" : "切換到淺色"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/60 text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-accent"
    >
      {theme === "light" ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </button>
  );
}
