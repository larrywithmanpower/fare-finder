import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Plane, LogOut } from "lucide-react";
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Plane className="h-4 w-4 text-primary" />
            Flight Price Notifier
          </span>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3.5 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
            Sign out / 登出
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="fade-up">
          <h1 className="text-3xl font-bold tracking-tight">你的降價通知</h1>
          <p className="mt-2 text-muted-foreground">
            Signed in as {user.email}
          </p>
        </div>

        <div
          className="fade-up mt-10 rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center"
          style={{ animationDelay: "0.15s" }}
        >
          <div className="mx-auto mb-4 inline-flex rounded-xl bg-accent p-3 text-primary">
            <Plane className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">還沒有追蹤任何航線</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Route subscriptions, target prices, and fare alerts are coming in the
            next milestone. 航線訂閱與目標價功能即將推出。
          </p>
        </div>
      </main>
    </div>
  );
}
