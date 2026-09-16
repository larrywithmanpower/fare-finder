import { createFileRoute, Link } from "@tanstack/react-router";
import { Plane, Bell, CircleSlash } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useT } from "@/lib/i18n";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";

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
    titleKey: "home.f1.title",
    subtitle: "Always-on route watching",
    bodyKey: "home.f1.body",
  },
  {
    icon: Bell,
    titleKey: "home.f2.title",
    subtitle: "Target-price email alerts",
    bodyKey: "home.f2.body",
  },
  {
    icon: CircleSlash,
    titleKey: "home.f3.title",
    subtitle: "Cancel anytime",
    bodyKey: "home.f3.body",
  },
];

/* 三步驟只複述頁面已宣告的能力：登入 → 設定航線與目標價 → 收 email */
const steps = [
  {
    titleKey: "home.s1.title",
    subtitle: "Sign in",
    bodyKey: "home.s1.body",
  },
  {
    titleKey: "home.s2.title",
    subtitle: "Set route & target price",
    bodyKey: "home.s2.body",
  },
  {
    titleKey: "home.s3.title",
    subtitle: "Wait for the email",
    bodyKey: "home.s3.body",
  },
];

function LandingPage() {
  const { t } = useT();
  useScrollReveal();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="inline-flex items-center gap-2.5">
          <Plane className="h-4 w-4 text-primary" aria-hidden />
          <span className="font-display text-base tracking-wide">
            Flight Price Notifier
          </span>
        </span>
        <span className="flex items-center gap-2.5">
          <LanguageSwitcher />
          <ThemeToggle />
          <Link
            to="/auth"
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            {t("nav.signIn")}
          </Link>
        </span>
      </header>

      <main>
        <section className="hero-glow relative overflow-hidden">
          <div
            className="starfield pointer-events-none absolute inset-0 opacity-70"
            aria-hidden
          />

          <div className="relative mx-auto max-w-4xl px-6 pt-24 pb-28 text-center sm:pt-32 sm:pb-36">
            <p className="fade-up mx-auto mb-8 inline-flex items-center gap-2.5 rounded-full border border-border bg-secondary/50 px-4 py-1.5 text-xs tracking-[0.12em] text-muted-foreground">
              <span
                className="h-1.5 w-1.5 rounded-full bg-horizon"
                aria-hidden
              />
              {t("home.heroBadge")}
            </p>

            <h1
              className="fade-up text-daybreak font-display font-black pb-3 text-5xl leading-[1.1] tracking-tight sm:text-7xl"
              style={{ animationDelay: "0.1s" }}
            >
              Flight Price Notifier
            </h1>

            <p
              className="fade-up mx-auto mt-8 max-w-2xl font-display text-2xl leading-relaxed text-foreground sm:text-3xl"
              style={{ animationDelay: "0.2s" }}
            >
              {t("home.heroTitle")}
            </p>

            <p
              className="fade-up mt-5 text-base text-muted-foreground sm:text-lg"
              style={{ animationDelay: "0.3s" }}
            >
              Set a route and a target price — we email you when the fare drops.
            </p>

            <div
              className="fade-up mt-12 flex flex-col items-center gap-4"
              style={{ animationDelay: "0.4s" }}
            >
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-xl bg-primary px-9 py-3.5 text-base font-semibold text-primary-foreground transition-all hover:brightness-110 glow-primary"
              >
                {t("nav.signIn")}
              </Link>
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Monthly · cancel anytime
              </span>
            </div>
          </div>

          {/* 地平線：hero 收在一條會呼吸的細金線上 */}
          <div
            className="horizon-line breathe pointer-events-none absolute inset-x-0 bottom-0 h-px"
            aria-hidden
          />
        </section>

        <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <div className="mb-14 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p
                data-reveal="rise"
                className="text-xs uppercase tracking-[0.2em] text-muted-foreground"
              >
                What it does
              </p>
              <h2
                data-reveal="mask"
                className="font-display mt-3 text-3xl tracking-tight sm:text-4xl"
                style={{ animationDelay: "0.1s" }}
              >
                {t("home.midTitle")}
              </h2>
            </div>
            <p
              data-reveal="rise"
              className="max-w-sm text-sm leading-relaxed text-muted-foreground"
              style={{ animationDelay: "0.25s" }}
            >
              {t("home.midBody")}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {features.map((feature, i) => (
              <article
                key={feature.titleKey}
                data-reveal="card"
                className="surface-sheen rounded-2xl border border-border bg-card p-7 transition-colors hover:border-primary/40"
                style={{ animationDelay: `${i * 0.14}s` }}
              >
                <div className="flex items-start justify-between">
                  <div className="inline-flex rounded-xl bg-accent p-3 text-primary">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <span
                    data-reveal="numeral"
                    className="font-display text-2xl text-muted-foreground/50"
                    style={{ animationDelay: `${0.35 + i * 0.14}s` }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>

                <h3 className="font-display mt-7 text-xl tracking-tight">
                  {t(feature.titleKey)}
                </h3>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {feature.subtitle}
                </p>

                <div className="my-5 h-px bg-border" aria-hidden />

                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(feature.bodyKey)}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <p
              data-reveal="rise"
              className="text-xs uppercase tracking-[0.2em] text-muted-foreground"
            >
              How it works
            </p>
            <h2
              data-reveal="mask"
              className="font-display mt-3 text-3xl tracking-tight sm:text-4xl"
              style={{ animationDelay: "0.1s" }}
            >
              {t("home.stepsTitle")}
            </h2>

            <ol className="mt-14 grid gap-12 sm:grid-cols-3 sm:gap-0">
              {steps.map((step, i) => (
                <li
                  key={step.titleKey}
                  className="relative sm:border-l sm:border-border sm:px-8 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0"
                >
                  <span
                    data-reveal="numeral"
                    className="font-display block text-sm text-horizon"
                    style={{ animationDelay: `${i * 0.18}s` }}
                  >
                    Step {String(i + 1).padStart(2, "0")}
                  </span>
                  <div
                    data-reveal="line"
                    className="horizon-line mt-4 mb-6 h-px opacity-40"
                    style={{ animationDelay: `${0.2 + i * 0.18}s` }}
                    aria-hidden
                  />
                  <h3
                    data-reveal="mask"
                    className="font-display text-2xl tracking-tight"
                    style={{ animationDelay: `${0.35 + i * 0.18}s` }}
                  >
                    {t(step.titleKey)}
                  </h3>
                  <p
                    data-reveal="rise"
                    className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground"
                    style={{ animationDelay: `${0.5 + i * 0.18}s` }}
                  >
                    {step.subtitle}
                  </p>
                  <p
                    data-reveal="rise"
                    className="mt-4 text-sm leading-relaxed text-muted-foreground"
                    style={{ animationDelay: `${0.6 + i * 0.18}s` }}
                  >
                    {t(step.bodyKey)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="hero-glow relative overflow-hidden border-t border-border">
          <div
            className="starfield pointer-events-none absolute inset-0 opacity-50"
            aria-hidden
          />
          <div className="relative mx-auto max-w-3xl px-6 py-24 text-center sm:py-28">
            <h2
              data-reveal="mask"
              className="font-display font-black text-4xl leading-tight tracking-tight sm:text-5xl"
            >
              {t("home.ctaTitle")}
            </h2>
            <p
              data-reveal="rise"
              className="mt-5 text-base text-muted-foreground"
              style={{ animationDelay: "0.2s" }}
            >
              Set your first route tonight — we will watch the fare while you sleep.
            </p>
            <div data-reveal="rise" className="mt-10" style={{ animationDelay: "0.35s" }}>
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-xl border border-primary/50 px-9 py-3.5 text-base font-medium text-primary transition-colors hover:bg-primary/10"
              >
                {t("nav.signIn")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
          <span className="font-display text-sm tracking-wide text-muted-foreground">
            Flight Price Notifier
          </span>
          <span className="text-xs text-muted-foreground">
            © 2026 Flight Price Notifier
          </span>
        </div>
      </footer>
    </div>
  );
}
