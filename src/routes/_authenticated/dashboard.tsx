import { useEffect, useState } from "react";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

// 兩個固定方案，與後端 Lambda 的 PLANS 對應
const plans = [
  {
    name: "tokyo",
    route: "TPE-TYO",
    title: "台北 ✈ 東京",
    en: "Taipei to Tokyo",
    hint: "近期最低約 NT$6,600",
    placeholder: "9000",
  },
  {
    name: "seoul",
    route: "TPE-SEL",
    title: "台北 ✈ 首爾",
    en: "Taipei to Seoul",
    hint: "近期最低約 NT$4,600",
    placeholder: "6000",
  },
] as const;

// M2 起每列都有 subscription_status；M1 時代建的舊資料沒有這個欄位，
// 那種列在後端會被付費閘門擋掉，所以這裡也當成「未訂閱」處理。
type SubscriptionStatus =
  | "pending_payment"
  | "active"
  | "cancelled"
  | "expired";

type Subscription = {
  route: string;
  plan_name: string;
  target_price: number;
  currency: string;
  subscription_status?: SubscriptionStatus;
  current_period_end_date?: string;
};

const MONTHLY_PRICE = "NT$300";

type CardState = {
  /** 已經付費（或在寬限期內），會收到通知 */
  served: boolean;
  badge: { label: string; icon: typeof Check; tone: "ok" | "warn" | "muted" } | null;
  /** 主要按鈕的文字，null 代表顯示「更新目標價」 */
  cta: string | null;
  note: string | null;
};

function cardState(sub: Subscription | undefined): CardState {
  const status = sub?.subscription_status;

  if (!sub || !status) {
    return {
      served: false,
      badge: null,
      cta: "訂閱並付款",
      note: `月費 ${MONTHLY_PRICE}，隨時可取消`,
    };
  }
  if (status === "active") {
    return {
      served: true,
      badge: { label: "已訂閱", icon: Check, tone: "ok" },
      cta: null,
      note: sub.current_period_end_date
        ? `本期至 ${sub.current_period_end_date}，到期自動續訂`
        : null,
    };
  }
  if (status === "pending_payment") {
    return {
      served: false,
      badge: { label: "未完成付款", icon: Clock, tone: "warn" },
      cta: "完成付款",
      note: "還沒收到款項，付款後才會開始通知你",
    };
  }
  if (status === "cancelled") {
    return {
      served: true,
      badge: { label: "已取消", icon: XCircle, tone: "muted" },
      cta: null,
      note: sub.current_period_end_date
        ? `不會再扣款，${sub.current_period_end_date} 前仍然會通知你`
        : "不會再扣款，本期結束前仍然會通知你",
    };
  }
  return {
    served: false,
    badge: { label: "已結束", icon: XCircle, tone: "muted" },
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
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("purchase");
    if (!value) return;
    setPurchase(value);
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
    queryFn: async (): Promise<Subscription[]> => {
      const res = await fetch(
        `${API_URL}/subscriptions?email=${encodeURIComponent(user.email!)}`,
      );
      if (!res.ok) throw new Error("讀取訂閱失敗");
      const data = await res.json();
      return data.subscriptions ?? [];
    },
  });

  const byRoute = new Map(
    (subscriptionsQuery.data ?? []).map((item) => [item.route, item]),
  );

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
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3.5 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <LogOut className="h-4 w-4" />
              Sign out / 登出
            </button>
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

          <section
            className="fade-up mt-14"
            style={{ animationDelay: "0.15s" }}
            aria-label="航線訂閱 / Route subscriptions"
          >
            <div className="flex items-baseline justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Watch a route / 追蹤航線
              </p>
              {subscriptionsQuery.isLoading && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  讀取中
                </span>
              )}
            </div>

            {purchase === "success" && (
              <p className="mt-6 flex items-start gap-2.5 rounded-lg border border-primary/40 bg-accent px-4 py-3 text-sm text-primary">
                <Check className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  付款完成，訂閱已啟用。若卡片狀態還沒更新，稍等幾秒再重新整理
                  —— 綠界的付款結果是另外送到我們後端的。
                </span>
              </p>
            )}
            {purchase === "failed" && (
              <p className="mt-6 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>付款沒有完成，訂閱尚未啟用。可以再按一次「完成付款」。</span>
              </p>
            )}

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.name}
                  plan={plan}
                  email={user.email!}
                  subscription={byRoute.get(plan.route)}
                />
              ))}
            </div>

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

function PlanCard({
  plan,
  email,
  subscription,
}: {
  plan: (typeof plans)[number];
  email: string;
  subscription: Subscription | undefined;
}) {
  const queryClient = useQueryClient();
  const state = cardState(subscription);
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // 已訂閱且不在編輯狀態時，輸入框顯示目前的目標價
  const inputValue = editing
    ? price
    : subscription
      ? String(subscription.target_price)
      : price;

  const save = useMutation({
    mutationFn: async (targetPrice: number) => {
      const res = await fetch(`${API_URL}/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          plan_name: plan.name,
          target_price: targetPrice,
        }),
      });
      if (!res.ok) throw new Error("儲存失敗");

      // M2 起後端會回兩種東西，一定要看 Content-Type 分流：
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
    },
    onSuccess: async (result) => {
      if (result?.redirected) return; // 已經跳去綠界了，不用再更新畫面
      setEditing(false);
      setPrice("");
      await queryClient.invalidateQueries({ queryKey: ["subscriptions", email] });
    },
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, route: plan.route }),
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
    const value = Number(inputValue);
    if (!Number.isFinite(value) || value <= 0) return;
    save.mutate(value);
  }

  // 服務期內且沒在改價 -> 鎖住輸入框，主按鈕變成「更新目標價」
  const locked = state.served && !editing;

  return (
    <form
      onSubmit={handleSubmit}
      className="surface-sheen rounded-xl border border-border bg-card/40 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl">{plan.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{plan.en}</p>
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
            disabled={locked}
            value={inputValue}
            onChange={(event) => {
              setEditing(true);
              setPrice(event.target.value);
            }}
            placeholder={plan.placeholder}
            className="w-full bg-transparent text-base text-foreground outline-none disabled:opacity-60"
          />
        </div>
      </label>

      <p className="mt-2 text-xs text-muted-foreground">{plan.hint}</p>
      {state.note && (
        <p className="mt-1.5 text-xs text-muted-foreground">{state.note}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {locked ? (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setPrice(String(subscription!.target_price));
            }}
            className="inline-flex items-center rounded-lg border border-border bg-secondary/60 px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-accent"
          >
            更新目標價
          </button>
        ) : (
          <button
            type="submit"
            disabled={save.isPending || !API_URL}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {save.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              state.cta && <CreditCard className="h-3.5 w-3.5" />
            )}
            {state.served ? "儲存" : state.cta}
          </button>
        )}
        {state.served && editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setPrice("");
            }}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            取消
          </button>
        )}

        {/* 只有真的在扣款中的人才需要退訂；已取消的人不必再取消一次 */}
        {subscription?.subscription_status === "active" && !editing && (
          confirmingCancel ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">確定取消訂閱？</span>
              <button
                type="button"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                {cancel.isPending && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
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
              取消訂閱
            </button>
          )
        )}
      </div>

      {save.isError && (
        <p className="mt-3 text-xs text-destructive">儲存失敗，稍後再試。</p>
      )}
      {cancel.isError && (
        <p className="mt-3 text-xs text-destructive">取消失敗，稍後再試。</p>
      )}
    </form>
  );
}
