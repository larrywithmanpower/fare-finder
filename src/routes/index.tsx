import { createFileRoute, Link } from "@tanstack/react-router";
import { Plane, Bell, CircleSlash } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flight Price Notifier — 機票降價通知" },
      {
        name: "description",
        content:
          "Set a route and a target price — we email you when the fare drops. 設定航線與目標價，機票降價就通知你。",
      },
      { property: "og:title", content: "Flight Price Notifier — 機票降價通知" },
      {
        property: "og:description",
        content: "Set a route and a target price — we email you when the fare drops.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const features = [
  {
    icon: Plane,
    title: "盯緊熱門航線",
    subtitle: "Always-on route watching",
    description: "持續監控台北出發的熱門航線（東京、首爾），自動抓最低票價。",
  },
  {
    icon: Bell,
    title: "達標自動通知",
    subtitle: "Target-price email alerts",
    description: "低於你設定的目標價，就寄 email 提醒你，附上立即訂購連結。",
  },
  {
    icon: CircleSlash,
    title: "隨時取消",
    subtitle: "Cancel anytime",
    description: "月訂閱制，不想用隨時停，沒有綁約。",
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-sm font-semibold tracking-tight">
          Flight Price Notifier
        </span>
        <Link
          to="/auth"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:brightness-110 glow-primary"
        >
          Sign in / 登入
        </Link>
      </header>

      <main>
        <section className="hero-glow">
          <div className="mx-auto max-w-4xl px-6 pt-24 pb-20 text-center sm:pt-32">
            <p className="fade-up mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-1.5 text-xs text-muted-foreground">
              <Plane className="h-3.5 w-3.5 text-primary" />
              台北出發 · 東京、首爾等熱門航線
            </p>
            <h1
              className="fade-up text-4xl font-bold tracking-tight sm:text-6xl"
              style={{ animationDelay: "0.1s" }}
            >
              Flight Price Notifier
            </h1>
            <p
              className="fade-up mt-6 text-xl font-medium text-foreground/90 sm:text-2xl"
              style={{ animationDelay: "0.2s" }}
            >
              設定航線與目標價，機票降價就通知你
            </p>
            <p
              className="fade-up mt-3 text-base text-muted-foreground sm:text-lg"
              style={{ animationDelay: "0.3s" }}
            >
              Set a route and a target price — we email you when the fare drops.
            </p>
            <div className="fade-up mt-10" style={{ animationDelay: "0.4s" }}>
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground transition-all hover:brightness-110 glow-primary"
              >
                Sign in / 登入
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-6 sm:grid-cols-3">
            {features.map((feature, i) => (
              <article
                key={feature.title}
                className="fade-up rounded-2xl border border-border bg-card p-7 transition-colors hover:border-primary/40"
                style={{ animationDelay: `${0.2 + i * 0.12}s` }}
              >
                <div className="mb-5 inline-flex rounded-xl bg-accent p-3 text-primary">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold">{feature.title}</h2>
                <p className="mt-0.5 text-sm font-medium text-primary/90">
                  {feature.subtitle}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © 2026 Flight Price Notifier
      </footer>
    </div>
  );
}
