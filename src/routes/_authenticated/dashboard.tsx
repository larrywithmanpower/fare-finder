import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plane,
  LogOut,
  BellRing,
  Check,
  Loader2,
  CreditCard,
  Clock,
  XCircle,
  Plus,
  ArrowLeftRight,
  X,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CityPicker } from "@/components/CityPicker";
import { routeLabel, splitRoute } from "@/lib/cities";
import { useT, type Locale, type Translate } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Flight Price Notifier" },
      { name: "description", content: "Manage your fare alerts." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

const API_URL = import.meta.env["VITE_FLIGHT_API_URL"] as string | undefined;

const MONTHLY_PRICE = "NT$300";

type PriceMap = Record<string, { price: number; currency: string } | null>;

/** 查這幾條航線下個月的最低票價，純參考，讓使用者知道目標價要設多少 */
function usePrices(routes: string[]) {
  const key = [...routes].sort().join(",");
  return useQuery({
    queryKey: ["prices", key],
    enabled: Boolean(API_URL && key),
    // 後端已經快取 30 分鐘，前端跟著放寬，不用每次切分頁都重查
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<PriceMap> => {
      const res = await fetch(`${API_URL}/price?routes=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error("price lookup failed");
      const data = await res.json();
      return data.prices ?? {};
    },
  });
}

function formatTWD(value: number) {
  return `NT$${Math.round(value).toLocaleString("en-US")}`;
}

// M2 起每列都有 subscription_status；M1 時代建的舊資料沒有這個欄位，
// 那種列在後端會被付費閘門擋掉，所以這裡也當成「未訂閱」處理。
type SubscriptionStatus =
  | "draft"
  | "pending_payment"
  | "active"
  | "cancelled"
  | "expired"
  | "removed";

type Subscription = {
  route: string;
  plan_name?: string;
  target_price: number;
  currency: string;
  subscription_status?: SubscriptionStatus;
  current_period_end_date?: string;
  removed_at?: string;
  created_at?: string;
};

type CardState = {
  /** 已經付費（或在寬限期內），會收到通知 */
  served: boolean;
  badge: { label: string; icon: typeof Check; tone: "ok" | "warn" | "muted" } | null;
  /** 還沒付費時，主要按鈕的文字 */
  cta: string | null;
  note: string | null;
  /** 按下 cta 之前一定要讓使用者看到的提醒 */
  warning?: string;
};

function cardState(sub: Subscription, t: Translate): CardState {
  const status = sub.subscription_status;

  if (status === "active") {
    return {
      served: true,
      badge: { label: t("badge.active"), icon: Check, tone: "ok" },
      cta: null,
      note: sub.current_period_end_date
        ? t("note.active", { date: sub.current_period_end_date })
        : null,
    };
  }
  if (status === "draft") {
    return {
      served: false,
      badge: { label: t("badge.draft"), icon: Clock, tone: "muted" },
      cta: t("cta.subscribe"),
      note: t("note.draft", { price: MONTHLY_PRICE }),
    };
  }
  if (status === "pending_payment") {
    return {
      served: false,
      badge: { label: t("badge.pending"), icon: Clock, tone: "warn" },
      cta: t("cta.completePayment"),
      note: t("note.pending"),
    };
  }
  if (status === "cancelled") {
    return {
      served: true,
      badge: { label: t("badge.cancelled"), icon: XCircle, tone: "muted" },
      // 綠界的定期定額約取消後無法復原，現在重訂等於同一個月付兩次錢，
      // 所以寬限期內不給重訂，到期變成 expired 時才出現「重新訂閱」
      cta: null,
      note: sub.current_period_end_date
        ? t("note.cancelled", { date: sub.current_period_end_date })
        : t("note.cancelledNoDate"),
    };
  }
  return {
    served: false,
    badge: { label: t("badge.expired"), icon: XCircle, tone: "muted" },
    cta: t("cta.resubscribe"),
    note: t("note.expired", { price: MONTHLY_PRICE }),
  };
}

function DashboardPage() {
  const { user } = Route.useRouteContext();
  const { t, locale } = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // 綠界付完款是導回 /dashboard?purchase=success，讀完就把參數從網址清掉，
  // 免得重新整理又跳一次橫幅
  const [purchase, setPurchase] = useState<string | null>(null);
  // 剛付款的那一條航線。使用者可能同時有好幾條沒付款的，
  // 所以只盯這一條有沒有啟用，不能看「清單裡還有沒有未付款的」
  const [paidRoute, setPaidRoute] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const value = query.get("purchase");
    if (!value) return;
    setPurchase(value);
    setPaidRoute(query.get("route"));
    if (value === "success") setWaiting(true);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const subscriptionsQuery = useQuery({
    queryKey: ["subscriptions", user.email],
    enabled: Boolean(API_URL && user.email),
    // 剛付完款時綠界的通知是另一條路送到後端的，會晚個幾秒，
    // 所以這裡自己輪詢到狀態變了為止，不用叫使用者重新整理
    refetchInterval: waiting ? 2000 : false,
    queryFn: async (): Promise<Subscription[]> => {
      const res = await fetch(
        `${API_URL}/subscriptions?email=${encodeURIComponent(user.email!)}`,
      );
      if (!res.ok) throw new Error("load subscriptions failed");
      const data = await res.json();
      return data.subscriptions ?? [];
    },
  });

  // 照加入的先後排，新加的排在最後面。
  // 用航線代碼排序的話，新增一條就會把既有的卡片洗牌（TPE-SYD 會插進 SEL 和 TYO 中間）
  const allRows = useMemo(
    () =>
      [...(subscriptionsQuery.data ?? [])].sort((a, b) =>
        (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
        a.route.localeCompare(b.route),
      ),
    [subscriptionsQuery.data],
  );
  const subscriptions = useMemo(
    () => allRows.filter((item) => item.subscription_status !== "removed"),
    [allRows],
  );
  const removed = useMemo(
    () =>
      allRows
        .filter((item) => item.subscription_status === "removed")
        // 剛移除的放最上面，最可能是要救回來的那筆
        .sort((a, b) => (b.removed_at ?? "").localeCompare(a.removed_at ?? "")),
    [allRows],
  );

  const pricesQuery = usePrices(subscriptions.map((item) => item.route));

  const bannerRoute = paidRoute ? routeLabel(paidRoute, locale) : "";
  const activated = paidRoute
    ? subscriptions.find((item) => item.route === paidRoute)
        ?.subscription_status === "active"
    : !subscriptions.some((i) => i.subscription_status === "pending_payment");

  // 剛付款的那條變成 active 就收工
  useEffect(() => {
    if (!waiting || !subscriptionsQuery.isFetched) return;
    const target = paidRoute
      ? subscriptions.find((item) => item.route === paidRoute)
      : undefined;
    const done = paidRoute
      ? target?.subscription_status === "active"
      : // 舊的回跳網址沒帶航線時的退路：只要沒有卡在未完成付款的就算好了
        !subscriptions.some((i) => i.subscription_status === "pending_payment");
    if (done) setWaiting(false);
  }, [waiting, paidRoute, subscriptions, subscriptionsQuery.isFetched]);

  // 保險：綠界真的沒送通知過來時不要無限轉圈
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setWaiting(false), 45_000);
    return () => clearTimeout(timer);
  }, [waiting]);

  // 啟用成功的橫幅看過就好，10 秒後自己收起來；失敗的留著等使用者處理
  useEffect(() => {
    if (purchase !== "success" || waiting || !activated) return;
    const timer = setTimeout(() => setPurchase(null), 10_000);
    return () => clearTimeout(timer);
  }, [purchase, waiting, activated]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* 工作區的夜航氛圍：強度刻意低於首頁 */}
      <div
        className="hero-glow pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
      />
      <div
        className="starfield pointer-events-none absolute inset-x-0 top-0 h-[32rem] opacity-40"
        aria-hidden
      />

      <div className="relative">
        <header className="relative border-b border-border/60">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <span className="flex items-center gap-2.5 text-sm tracking-tight">
              <Plane className="h-4 w-4 text-primary" />
              <span className="font-display text-base">
                Flight Price Notifier
              </span>
            </span>
            <span className="flex items-center gap-2.5">
              <LanguageSwitcher />
              <ThemeToggle />
              <button
                onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3.5 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-accent"
            >
                <LogOut className="h-4 w-4" />
                {t("nav.signOut")}
              </button>
            </span>
          </div>
          <div
            className="horizon-line pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-60"
            aria-hidden
          />
        </header>

        <main className="mx-auto max-w-6xl px-6 py-20">
          <div className="fade-up max-w-4xl">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <span className="inline-block h-1 w-1 rounded-full bg-horizon" />
              Your fare watch
            </p>
            <h1 className="mt-4 font-display text-5xl sm:text-6xl">
              {t("dash.title")}
            </h1>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/70" />
              {t("dash.signedInAs")}
              <span className="text-foreground">{user.email}</span>
            </div>
          </div>

          {purchase === "success" && (
            <Banner tone="ok" onClose={() => setPurchase(null)} closeLabel={t("banner.close")}>
              {waiting ? (
                <>
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                  <span>{t("banner.activating", { route: bannerRoute })}</span>
                </>
              ) : activated ? (
                <>
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t("banner.activated", { route: bannerRoute })}</span>
                </>
              ) : (
                <>
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t("banner.unconfirmed", { route: bannerRoute })}</span>
                </>
              )}
            </Banner>
          )}
          {purchase === "failed" && (
            <Banner tone="bad" onClose={() => setPurchase(null)} closeLabel={t("banner.close")}>
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("banner.failed", { route: bannerRoute })}</span>
            </Banner>
          )}

          <section
            className="fade-up mt-14"
            style={{ animationDelay: "0.15s" }}
            aria-label={t("dash.myRoutes")}
          >
            <div className="flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {t("dash.myRoutes")}
              </p>
              <span className="flex items-center gap-3">
                {subscriptionsQuery.isLoading && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("dash.loading")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("dash.addRoute")}
                </button>
              </span>
            </div>

            {!subscriptionsQuery.isLoading && subscriptions.length === 0 && (
              <div className="mt-6 rounded-xl border border-dashed border-border px-5 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("dash.empty")}
                </p>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("dash.addFirst")}
                </button>
              </div>
            )}

            {subscriptions.length > 0 && (
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {subscriptions.map((sub) => (
                  <RouteCard
                    key={sub.route}
                    subscription={sub}
                    email={user.email!}
                    {...(pricesQuery.data?.[sub.route]?.price !== undefined
                      ? { currentPrice: pricesQuery.data[sub.route]!.price }
                      : {})}
                  />
                ))}
              </div>
            )}

            {!API_URL && (
              <p className="mt-6 text-sm text-muted-foreground">
                {t("dash.noApi")}
              </p>
            )}
            {subscriptionsQuery.isError && (
              <p className="mt-6 text-sm text-destructive">
                {t("dash.loadError")}
              </p>
            )}
          </section>

          {removed.length > 0 && (
            <RemovedSection rows={removed} email={user.email!} />
          )}

          <section
            className="fade-up mt-16 rounded-2xl border border-border bg-card/40 p-6"
            style={{ animationDelay: "0.3s" }}
          >
            <div className="flex items-start gap-3.5">
              <div className="inline-flex rounded-lg bg-accent p-2.5 text-primary">
                <BellRing className="h-4 w-4" />
              </div>
              <div>
                <p className="font-display text-lg">{t("info.title")}</p>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {t("info.body1")}
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {t("info.body2", { price: MONTHLY_PRICE })}
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>

      {adding && (
        <AddRouteDialog
          email={user.email!}
          existing={subscriptions.map((item) => item.route)}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

/** 最近移除 —— 軟刪除的航線放這裡，30 天後才真的清掉，這期間可以救回來 */
function RemovedSection({ rows, email }: { rows: Subscription[]; email: string }) {
  const { t, locale } = useT();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const act = useMutation({
    mutationFn: async ({
      row,
      purge,
    }: {
      row: Subscription;
      purge: boolean;
    }) => {
      const [origin, destination] = splitRoute(row.route);
      const res = purge
        ? await fetch(`${API_URL}/cancel`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, route: row.route, purge: true }),
          })
        : await fetch(`${API_URL}/subscribe`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              email,
              origin,
              destination,
              target_price: row.target_price,
              draft: true,
              locale,
            }),
          });
      if (!res.ok) throw new Error("removed action failed");
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscriptions", email] });
    },
  });

  return (
    <section className="fade-up mt-16" style={{ animationDelay: "0.26s" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
      >
        {t("removed.title", { count: rows.length })}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("removed.hint")}
          </p>
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card/40">
            {rows.map((row) => (
              <li
                key={row.route}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="text-sm">{routeLabel(row.route, locale)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("removed.target", { price: formatTWD(row.target_price) })}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    disabled={act.isPending}
                    onClick={() => act.mutate({ row, purge: false })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t("removed.restore")}
                  </button>
                  <button
                    type="button"
                    disabled={act.isPending}
                    onClick={() => act.mutate({ row, purge: true })}
                    className="text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                  >
                    {t("removed.purge")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {act.isError && (
            <p className="mt-3 text-xs text-destructive">{t("removed.error")}</p>
          )}
        </>
      )}
    </section>
  );
}

/** 頁面上方的提示條，一律可以手動關掉 */
function Banner({
  tone,
  onClose,
  closeLabel,
  children,
}: {
  tone: "ok" | "bad";
  onClose: () => void;
  closeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`fade-up mt-10 flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${
        tone === "ok"
          ? "border-primary/40 bg-accent text-primary"
          : "border-destructive/40 bg-destructive/10 text-destructive"
      }`}
    >
      {children}
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="ml-auto shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** 送訂閱請求。後端會回兩種東西，一定要看 Content-Type 分流 */
async function submitSubscription(payload: {
  email: string;
  origin: string;
  destination: string;
  target_price: number;
  /** true = 只加進追蹤清單，不進付款流程 */
  draft?: boolean;
  /** 通知信要用哪個語言寄 */
  locale: Locale;
}) {
  const res = await fetch(`${API_URL}/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("save failed");

  //   text/html        -> 綠界收銀台的自動送出表單，直接把瀏覽器交出去
  //   application/json -> 已付費者就地更新目標價，不用重新付款
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    const html = await res.text();
    document.open();
    document.write(html);
    document.close();
    return { redirected: true };
  }
  return res.json();
}

function AddRouteDialog({
  email,
  existing,
  onClose,
}: {
  email: string;
  existing: string[];
  onClose: () => void;
}) {
  const { t, locale } = useT();
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState("TPE");
  const [destination, setDestination] = useState("");
  const [price, setPrice] = useState("");

  const route = origin && destination ? `${origin}-${destination}` : "";
  const alreadyWatching = Boolean(route) && existing.includes(route);
  const pricesQuery = usePrices(route ? [route] : []);
  const currentPrice = route ? pricesQuery.data?.[route]?.price : undefined;

  const save = useMutation({
    mutationFn: (targetPrice: number) =>
      submitSubscription({
        email,
        origin,
        destination,
        target_price: targetPrice,
        draft: true,
        locale,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscriptions", email] });
      onClose();
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(price);
    if (!destination || !Number.isFinite(value) || value <= 0) return;
    save.mutate(value);
  }

  function swap() {
    setOrigin(destination || "TPE");
    setDestination(origin);
  }

  // Esc 關閉；開著的時候鎖住背景捲動
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-background/70 p-4 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        // 只有點在背景（不是彈窗裡面）才關
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t("dialog.title")}
    >
      <form
        onSubmit={handleSubmit}
        className="surface-sheen my-auto w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-xl">{t("dialog.title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("dialog.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("dialog.close")}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <CityPicker
            label={t("dialog.from")}
            value={origin}
            onChange={setOrigin}
            exclude={destination}
          />
          <button
            type="button"
            onClick={swap}
            aria-label={t("dialog.swap")}
            className="mt-6 hidden h-11 w-11 items-center justify-center self-start rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:inline-flex"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <CityPicker
            label={t("dialog.to")}
            value={destination}
            onChange={setDestination}
            exclude={origin}
          />
        </div>

        {route && (
          <p className="mt-4 text-xs text-muted-foreground">
            {pricesQuery.isLoading ? (
              t("dialog.priceLoading")
            ) : currentPrice ? (
              <>
                {t("dialog.priceHint", {
                  route: routeLabel(route, locale),
                  price: formatTWD(currentPrice),
                })}
                <button
                  type="button"
                  onClick={() => setPrice(String(Math.round(currentPrice)))}
                  className="ml-2 text-primary underline-offset-2 hover:underline"
                >
                  {t("dialog.usePrice")}
                </button>
              </>
            ) : (
              t("dialog.noPrice")
            )}
          </p>
        )}

        <label className="mt-4 block text-xs text-muted-foreground">
          {t("dialog.targetLabel")}
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2.5 focus-within:border-primary/40">
            <span className="text-sm text-muted-foreground">NT$</span>
            <input
              type="number"
              min={1}
              step="any"
              required
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder={currentPrice ? String(Math.round(currentPrice)) : "15000"}
              className="w-full bg-transparent text-base text-foreground outline-none"
            />
          </div>
        </label>

        {alreadyWatching && (
          <p className="mt-3 text-xs text-muted-foreground">
{t("dialog.already", { route: routeLabel(route, locale) })}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={save.isPending || !destination || !API_URL}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {save.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {destination
              ? t("dialog.add", { route: routeLabel(route, locale) })
              : t("dialog.pickDest")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("dialog.cancel")}
          </button>
        </div>

        {save.isError && (
          <p className="mt-3 text-xs text-destructive">{t("card.saveError")}</p>
        )}
      </form>
    </div>
  );
}

function RouteCard({
  subscription,
  email,
  currentPrice,
}: {
  subscription: Subscription;
  email: string;
  /** 下個月的最低票價，查不到就不顯示 */
  currentPrice?: number;
}) {
  const { t, locale } = useT();
  const queryClient = useQueryClient();
  const state = cardState(subscription, t);
  const [price, setPrice] = useState(String(subscription.target_price));
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // 任何會扣到錢的動作都先讓使用者確認一次，不直接把人丟去收銀台
  const [confirmingPay, setConfirmingPay] = useState(false);
  const [origin, destination] = splitRoute(subscription.route);
  const isActive = subscription.subscription_status === "active";

  // 後端改了目標價（例如另一個分頁存的）就跟著更新，但別蓋掉正在打的字
  const [baseline, setBaseline] = useState(String(subscription.target_price));
  if (baseline !== String(subscription.target_price)) {
    setBaseline(String(subscription.target_price));
    setPrice(String(subscription.target_price));
  }

  const dirty = price !== String(subscription.target_price);

  const save = useMutation({
    mutationFn: ({ targetPrice }: { targetPrice: number }) =>
      submitSubscription({
        email,
        origin,
        destination,
        target_price: targetPrice,
        locale,
      }),
    onSuccess: async (result) => {
      if (result?.redirected) return;
      await queryClient.invalidateQueries({ queryKey: ["subscriptions", email] });
    },
  });

  // 同一個端點：active 的列是跟綠界取消扣款，其他狀態直接從清單移除
  const cancel = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, route: subscription.route }),
      });
      if (!res.ok) throw new Error("cancel failed");
      return res.json();
    },
    onSuccess: async () => {
      setConfirmingCancel(false);
      await queryClient.invalidateQueries({ queryKey: ["subscriptions", email] });
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(price);
    if (!Number.isFinite(value) || value <= 0) return;
    if (state.served) {
      save.mutate({ targetPrice: value }); // 只是改目標價，不扣錢
      return;
    }
    setConfirmingPay(true);
  }


  return (
    <form
      onSubmit={handleSubmit}
      className="surface-sheen rounded-xl border border-border bg-card/40 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xl">
            {routeLabel(subscription.route, locale)}
          </p>
          {locale !== "en" && (
            <p className="mt-1 text-xs text-muted-foreground">
              {routeLabel(subscription.route, "en")}
            </p>
          )}
        </div>
        {state.badge && (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
              state.badge.tone === "ok"
                ? "border-primary/40 bg-accent text-primary"
                : state.badge.tone === "warn"
                  ? "border-horizon/40 bg-secondary/60 text-horizon"
                  : "border-border bg-secondary/60 text-muted-foreground"
            }`}
          >
            <state.badge.icon className="h-3 w-3" />
            {state.badge.label}
          </span>
        )}
      </div>

      <div className="horizon-line mt-5 h-px opacity-50" aria-hidden />

      <label className="mt-5 block text-xs text-muted-foreground">
        {t("card.targetPrice")}
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 focus-within:border-primary/40">
          <span className="text-sm text-muted-foreground">NT$</span>
          <input
            type="number"
            min={1}
            step="any"
            required
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="w-full bg-transparent text-base text-foreground outline-none"
          />
        </div>
      </label>

      <p className="mt-2 text-xs text-muted-foreground">
        {currentPrice
          ? t("card.currentPrice", { price: formatTWD(currentPrice) })
          : t("card.priceLoading")}
      </p>
      {state.note && (
        <p className="mt-1.5 text-xs text-muted-foreground">{state.note}</p>
      )}
      {state.warning && (
        <p className="mt-1.5 text-xs text-horizon">{state.warning}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* 已付費的人只有改了數字才需要按儲存；沒付費的人一律走付款流程 */}
        {state.served ? (
          dirty && (
            <>
              <button
                type="submit"
                disabled={save.isPending || !API_URL}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t("card.update")}
              </button>
              <button
                type="button"
                onClick={() => setPrice(String(subscription.target_price))}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("card.revert")}
              </button>
            </>
          )
        ) : (
          !confirmingPay && (
            <button
              type="submit"
              disabled={!API_URL}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <CreditCard className="h-3.5 w-3.5" />
              {state.cta}
            </button>
          )
        )}

        {/* 扣款前的最後確認 —— 按下「前往付款」才會離開這個網站 */}
        {confirmingPay && (
          <span className="flex w-full flex-wrap items-center gap-2 text-sm">
            <span className="w-full text-muted-foreground">
              {t("card.payConfirm", { price: MONTHLY_PRICE })}
            </span>
            <button
              type="button"
              disabled={save.isPending || !API_URL}
              onClick={() =>
                save.mutate({
                  targetPrice: Number(price),
                })
              }
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CreditCard className="h-3.5 w-3.5" />
              )}
              {t("card.goPay")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingPay(false)}
              className="shrink-0 whitespace-nowrap text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              再想想
            </button>
          </span>
        )}

        {/* active 要退訂（跟綠界取消扣款）；沒付過款的列則是單純從清單移除 */}
        {!confirmingPay &&
          (confirmingCancel ? (
            <span className="flex w-full flex-wrap items-center gap-2 text-sm">
              <span className="w-full text-muted-foreground">
                {isActive ? t("card.confirmCancel") : t("card.confirmRemove")}
              </span>
              <button
                type="button"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                {cancel.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                {t("card.confirmYes")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                className="shrink-0 whitespace-nowrap text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("card.rethink")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <XCircle className="h-3.5 w-3.5" />
              {isActive ? t("card.cancel") : t("card.remove")}
            </button>
          ))}
      </div>

      {save.isError && (
        <p className="mt-3 text-xs text-destructive">{t("card.saveError")}</p>
      )}
      {cancel.isError && (
        <p className="mt-3 text-xs text-destructive">
          {isActive ? t("card.cancelError") : t("card.removeError")}
        </p>
      )}
    </form>
  );
}
