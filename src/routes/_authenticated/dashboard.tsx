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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CityPicker } from "@/components/CityPicker";
import { routeLabel, routeLabelEn, splitRoute } from "@/lib/cities";

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

// M2 起每列都有 subscription_status；M1 時代建的舊資料沒有這個欄位，
// 那種列在後端會被付費閘門擋掉，所以這裡也當成「未訂閱」處理。
type SubscriptionStatus =
  | "draft"
  | "pending_payment"
  | "active"
  | "cancelled"
  | "expired";

type Subscription = {
  route: string;
  plan_name?: string;
  target_price: number;
  currency: string;
  subscription_status?: SubscriptionStatus;
  current_period_end_date?: string;
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

function cardState(sub: Subscription): CardState {
  const status = sub.subscription_status;

  if (status === "active") {
    return {
      served: true,
      badge: { label: "通知中", icon: Check, tone: "ok" },
      cta: null,
      note: sub.current_period_end_date
        ? `本期至 ${sub.current_period_end_date}，到期自動續訂`
        : null,
    };
  }
  if (status === "draft") {
    return {
      served: false,
      badge: { label: "未訂閱", icon: Clock, tone: "muted" },
      cta: "訂閱並付款",
      note: `每月 ${MONTHLY_PRICE}，訂閱後才會開始為你盯這條航線`,
    };
  }
  if (status === "pending_payment") {
    return {
      served: false,
      badge: { label: "未完成付款", icon: Clock, tone: "warn" },
      cta: "完成付款",
      note: "付款完成後才會開始為你盯票價",
    };
  }
  if (status === "cancelled") {
    return {
      served: true,
      badge: { label: "已取消續訂", icon: XCircle, tone: "muted" },
      cta: "恢復自動續訂",
      note: sub.current_period_end_date
        ? `不會再扣款，${sub.current_period_end_date} 前仍然會通知你`
        : "不會再扣款，本期結束前仍然會通知你",
      // 綠界的定期定額約取消後無法復原，「恢復」其實是重新簽一張新的約
      warning:
        "恢復會重新扣一次 NT$300 並開始新的一期，本期剩下的天數不折抵。",
    };
  }
  return {
    served: false,
    badge: { label: "已停止", icon: XCircle, tone: "muted" },
    cta: "重新訂閱",
    note: `月費 ${MONTHLY_PRICE}，隨時可取消`,
  };
}

function DashboardPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // 綠界付完款是導回 /dashboard?purchase=success，讀完就把參數從網址清掉，
  // 免得重新整理又跳一次橫幅
  const [purchase, setPurchase] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("purchase");
    if (!value) return;
    setPurchase(value);
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
      if (!res.ok) throw new Error("讀取訂閱失敗");
      const data = await res.json();
      return data.subscriptions ?? [];
    },
  });

  const subscriptions = useMemo(
    () =>
      [...(subscriptionsQuery.data ?? [])].sort((a, b) =>
        a.route.localeCompare(b.route),
      ),
    [subscriptionsQuery.data],
  );

  // 沒有 pending_payment 了就代表啟用完成，停止輪詢
  useEffect(() => {
    if (!waiting) return;
    const stillPending = subscriptions.some(
      (item) => item.subscription_status === "pending_payment",
    );
    if (!stillPending && subscriptionsQuery.isFetched) setWaiting(false);
  }, [waiting, subscriptions, subscriptionsQuery.isFetched]);

  // 保險：綠界真的沒送通知過來時不要無限轉圈
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setWaiting(false), 60_000);
    return () => clearTimeout(timer);
  }, [waiting]);

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
              <ThemeToggle />
              <button
                onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3.5 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-accent"
            >
                <LogOut className="h-4 w-4" />
                Sign out / 登出
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
              你的降價通知
            </h1>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/70" />
              Signed in as
              <span className="text-foreground">{user.email}</span>
            </div>
          </div>

          {purchase === "success" && (
            <p className="fade-up mt-10 flex items-start gap-2.5 rounded-lg border border-primary/40 bg-accent px-4 py-3 text-sm text-primary">
              {waiting ? (
                <>
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                  <span>付款完成，正在啟用你的訂閱…</span>
                </>
              ) : (
                <>
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>訂閱已啟用，我們開始為你盯票價了。</span>
                </>
              )}
            </p>
          )}
          {purchase === "failed" && (
            <p className="fade-up mt-10 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>付款沒有完成，這條航線還沒開始通知你。可以再按一次「完成付款」。</span>
            </p>
          )}

          <section
            className="fade-up mt-14"
            style={{ animationDelay: "0.15s" }}
            aria-label="我的航線"
          >
            <div className="flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                My routes / 我的航線
              </p>
              {subscriptionsQuery.isLoading && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  讀取中
                </span>
              )}
            </div>

            {!subscriptionsQuery.isLoading && subscriptions.length === 0 && (
              <p className="mt-6 rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
                還沒有追蹤中的航線。在下面挑一組出發地與目的地就可以開始。
              </p>
            )}

            {subscriptions.length > 0 && (
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {subscriptions.map((sub) => (
                  <RouteCard
                    key={sub.route}
                    subscription={sub}
                    email={user.email!}
                  />
                ))}
              </div>
            )}

            {!API_URL && (
              <p className="mt-6 text-sm text-muted-foreground">
                尚未設定 <code>VITE_FLIGHT_API_URL</code>，訂閱功能停用。
              </p>
            )}
            {subscriptionsQuery.isError && (
              <p className="mt-6 text-sm text-destructive">
                讀不到現有訂閱，稍後再試。
              </p>
            )}
          </section>

          <AddRouteSection
            email={user.email!}
            existing={subscriptions.map((item) => item.route)}
          />

          <section
            className="fade-up mt-16 rounded-2xl border border-border bg-card/40 p-6"
            style={{ animationDelay: "0.3s" }}
          >
            <div className="flex items-start gap-3.5">
              <div className="inline-flex rounded-lg bg-accent p-2.5 text-primary">
                <BellRing className="h-4 w-4" />
              </div>
              <div>
                <p className="font-display text-lg">通知怎麼送到你手上</p>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  我們每 30 分鐘查一次下個月的最低票價。低於你的目標價就寄 email
                  給你，附上立即訂購連結。同一條航線 24
                  小時內只寄一次，除非價格又跌超過 20%（或 NT$2,000）。
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  每條航線月費 {MONTHLY_PRICE}，由綠界信用卡定期定額扣款。
                  隨時可以取消，取消後不再扣款，但本期結束前仍然會通知你。
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
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
  /** true = 已取消的人要恢復自動續訂，得重新簽一次綠界的定期定額約 */
  resume?: boolean;
}) {
  const res = await fetch(`${API_URL}/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("儲存失敗");

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

function AddRouteSection({
  email,
  existing,
}: {
  email: string;
  existing: string[];
}) {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState("TPE");
  const [destination, setDestination] = useState("");
  const [price, setPrice] = useState("");

  const route = origin && destination ? `${origin}-${destination}` : "";
  const alreadyWatching = Boolean(route) && existing.includes(route);

  const save = useMutation({
    mutationFn: (targetPrice: number) =>
      submitSubscription({
        email,
        origin,
        destination,
        target_price: targetPrice,
        draft: true,
      }),
    onSuccess: async () => {
      setDestination("");
      setPrice("");
      await queryClient.invalidateQueries({ queryKey: ["subscriptions", email] });
      document
        .querySelector('[aria-label="我的航線"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  return (
    <section
      className="fade-up relative z-30 mt-16"
      style={{ animationDelay: "0.22s" }}
      aria-label="新增航線"
    >
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Add a route / 新增航線
      </p>

      <form
        onSubmit={handleSubmit}
        className="surface-sheen mt-6 rounded-xl border border-border bg-card/40 p-5 sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <CityPicker
            label="從哪裡出發"
            value={origin}
            onChange={setOrigin}
            exclude={destination}
          />
          <button
            type="button"
            onClick={swap}
            aria-label="對調出發地與目的地"
            className="mt-6 hidden h-11 w-11 items-center justify-center self-start rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:inline-flex"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <CityPicker
            label="要去哪裡"
            value={destination}
            onChange={setDestination}
            exclude={origin}
          />
        </div>

        <label className="mt-5 block text-xs text-muted-foreground">
          目標價（TWD）—— 低於這個價格就通知你
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2.5 focus-within:border-primary/40">
            <span className="text-sm text-muted-foreground">NT$</span>
            <input
              type="number"
              min={1}
              step="any"
              required
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="15000"
              className="w-full bg-transparent text-base text-foreground outline-none"
            />
          </div>
        </label>

        {alreadyWatching && (
          <p className="mt-3 text-xs text-muted-foreground">
{routeLabel(route)} 已經在你的清單裡，送出會直接更新它的目標價。
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
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
            {destination ? `加入追蹤 ${routeLabel(route)}` : "選一個目的地"}
          </button>
          <span className="text-xs text-muted-foreground">
            先加進清單，要不要付費訂閱在上面的卡片決定
          </span>
        </div>

        {save.isError && (
          <p className="mt-3 text-xs text-destructive">儲存失敗，稍後再試。</p>
        )}
      </form>
    </section>
  );
}

function RouteCard({
  subscription,
  email,
}: {
  subscription: Subscription;
  email: string;
}) {
  const queryClient = useQueryClient();
  const state = cardState(subscription);
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
    mutationFn: ({ targetPrice, resume }: { targetPrice: number; resume?: boolean }) =>
      submitSubscription({
        email,
        origin,
        destination,
        target_price: targetPrice,
        ...(resume ? { resume: true as const } : {}),
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
      if (!res.ok) throw new Error("取消失敗");
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

  const isCancelled = subscription.subscription_status === "cancelled";

  return (
    <form
      onSubmit={handleSubmit}
      className="surface-sheen rounded-xl border border-border bg-card/40 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xl">{routeLabel(subscription.route)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {routeLabelEn(subscription.route)}
          </p>
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
        目標價（TWD）
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

      {state.note && (
        <p className="mt-2 text-xs text-muted-foreground">{state.note}</p>
      )}
      {state.warning && (
        <p className="mt-1.5 text-xs text-horizon">{state.warning}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {/* 已付費的人只有改了數字才需要按儲存；沒付費的人一律走付款流程 */}
        {isCancelled && !dirty && !confirmingPay && (
          <button
            type="button"
            onClick={() => setConfirmingPay(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <CreditCard className="h-3.5 w-3.5" />
            {state.cta}
          </button>
        )}

        {state.served ? (
          dirty && (
            <>
              <button
                type="submit"
                disabled={save.isPending || !API_URL}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                儲存目標價
              </button>
              <button
                type="button"
                onClick={() => setPrice(String(subscription.target_price))}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                還原
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
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              將前往綠界結帳，每月 {MONTHLY_PRICE}。
            </span>
            <button
              type="button"
              disabled={save.isPending || !API_URL}
              onClick={() =>
                save.mutate({
                  targetPrice: Number(price),
                  ...(isCancelled ? { resume: true } : {}),
                })
              }
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CreditCard className="h-3.5 w-3.5" />
              )}
              前往付款
            </button>
            <button
              type="button"
              onClick={() => setConfirmingPay(false)}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              再想想
            </button>
          </span>
        )}

        {/* active 要退訂（跟綠界取消扣款）；沒付過款的列則是單純從清單移除 */}
        {!confirmingPay &&
          (subscription.subscription_status === "active" || !state.served) &&
          (confirmingCancel ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {isActive ? "確定取消訂閱？" : "從清單移除這條航線？"}
              </span>
              <button
                type="button"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                {cancel.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                確定
              </button>
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                再想想
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {isActive ? "取消訂閱" : "移除"}
            </button>
          ))}
      </div>

      {save.isError && (
        <p className="mt-3 text-xs text-destructive">儲存失敗，稍後再試。</p>
      )}
      {cancel.isError && (
        <p className="mt-3 text-xs text-destructive">
          {isActive ? "取消失敗，稍後再試。" : "移除失敗，稍後再試。"}
        </p>
      )}
    </form>
  );
}
