import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Plane, LogOut, BellRing, Route as RouteIcon, Tag } from "lucide-react";
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

// 尚未實作的功能預覽，僅作為 roadmap 呈現，不可做成可點擊的介面
const upcoming = [
  {
    icon: RouteIcon,
    title: "航線訂閱",
    en: "Route subscriptions",
  },
  {
    icon: Tag,
    title: "目標票價",
    en: "Target prices",
  },
  {
    icon: BellRing,
    title: "降價通知",
    en: "Fare alerts",
  },
];

function DashboardPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

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
            className="fade-up mt-14 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center"
            style={{ animationDelay: "0.15s" }}
          >
            <div className="mx-auto inline-flex rounded-xl bg-accent p-3.5 text-primary">
              <Plane className="h-6 w-6" />
            </div>
            <h2 className="mt-6 font-display text-2xl sm:text-3xl">
              還沒有追蹤任何航線
            </h2>
            <div
              className="horizon-line mx-auto mt-6 h-px w-40 opacity-70"
              aria-hidden
            />
            <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
              Route subscriptions, target prices, and fare alerts are coming in
              the next milestone. 航線訂閱與目標價功能即將推出。
            </p>
          </section>

          <section
            className="fade-up mt-16"
            style={{ animationDelay: "0.3s" }}
            aria-label="即將推出的功能 / Upcoming features"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Coming soon / 即將推出（尚未啟用）
            </p>
            <div className="mt-6 grid gap-4 opacity-50 sm:grid-cols-3">
              {upcoming.map((item) => (
                <div
                  key={item.en}
                  className="surface-sheen rounded-xl border border-border bg-card/40 p-5"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <p className="mt-4 font-display text-lg">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.en} — not available yet
                  </p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
