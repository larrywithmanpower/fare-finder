import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Flight Price Notifier" },
      { name: "description", content: "Sign in to manage your fare alerts." },
      { property: "og:title", content: "Sign in — Flight Price Notifier" },
      { property: "og:description", content: "Sign in to manage your fare alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        // 專案關掉了 Confirm email，註冊當下就會拿到 session，直接進 dashboard
        // 之後若把 Confirm email 開回來，signUp 不會給 session，才顯示收信提示
        if (data.session) {
          navigate({ to: "/dashboard" });
        } else {
          setNotice("Check your email to confirm your account, then sign in.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="hero-glow flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* 裝飾層：夜空星點，不接受任何互動 */}
      <div className="starfield pointer-events-none absolute inset-0 opacity-60" aria-hidden />

      <header className="relative mx-auto flex w-full max-w-6xl items-center px-6 py-6">
        <Link to="/" className="group inline-flex items-center gap-2.5">
          <Plane className="h-4 w-4 text-primary" aria-hidden />
          <span className="font-display text-lg tracking-tight transition-colors group-hover:text-primary">
            Flight Price Notifier
          </span>
        </Link>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-6 pb-24 pt-4">
        <div className="w-full max-w-md">
          <div className="fade-up relative overflow-hidden rounded-2xl border border-border bg-card surface-sheen p-8 sm:p-10">
            {/* 卡片上緣的地平線記號 */}
            <div className="horizon-line breathe pointer-events-none absolute inset-x-0 top-0 h-px" aria-hidden />

            <div className="mb-9 text-center">
              <div className="mx-auto mb-5 inline-flex rounded-xl bg-accent p-3 text-primary">
                <Plane className="h-5 w-5" />
              </div>
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {mode === "signin" ? "Returning traveller" : "New traveller"}
              </p>
              <h1 className="font-display text-3xl tracking-tight sm:text-4xl">
                {mode === "signin" ? "Welcome back．登入" : "Create account．註冊"}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {mode === "signin"
                  ? "Sign in to manage your fare alerts．登入後管理你的票價提醒"
                  : "Create an account to start tracking fares．建立帳號開始追蹤票價"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-xs uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus:border-primary focus:ring-2 focus:ring-ring/40"
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-xs uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus:border-primary focus:ring-2 focus:ring-ring/40"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  At least 6 characters．至少 6 個字元
                </p>
              </div>

              {error && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm leading-relaxed text-destructive">
                  {error}
                </p>
              )}
              {notice && (
                <p className="rounded-lg border border-primary/40 bg-accent px-3.5 py-2.5 text-sm leading-relaxed text-accent-foreground">
                  {notice}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60 glow-primary"
              >
                {loading
                  ? "Please wait…"
                  : mode === "signin"
                    ? "Sign in / 登入"
                    : "Create account / 註冊"}
              </button>
            </form>

            <div className="horizon-line pointer-events-none mt-8 h-px opacity-40" aria-hidden />

            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
              }}
              className="mt-6 w-full text-center text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              {mode === "signin"
                ? "No account yet? Create one"
                : "Already have an account? Sign in"}
            </button>
          </div>

          <p
            className="fade-up mt-6 text-center text-xs leading-relaxed text-muted-foreground"
            style={{ animationDelay: "0.2s" }}
          >
            Your email is only used for fare alerts．你的信箱只用來寄票價提醒
          </p>
        </div>
      </main>
    </div>
  );
}
