import Image from "next/image";
import Link from "next/link";

/**
 * The frame shared by every account page — sign in, create an account, the
 * officer's set-up, two-factor and password reset (26 September 2026).
 *
 * Dark glass and Leon gold, after the references: the form on a frosted panel
 * on the left; on a large screen, a showcase on the right — the shield in
 * gold over a floor that runs into the dark, with glass cards floating above
 * it showing what the portal does. Always dark, whatever theme a person
 * later picks for themselves. The tokens are redefined in `.auth-shell`
 * (globals.css), so the forms inside are unchanged.
 */
export function AuthShell({
  active,
  title,
  intro,
  children,
}: {
  active: "signin" | "signup";
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  const other = active === "signin" ? { text: "New to the portal?", link: "Create an account", href: "/signup" } : { text: "Already have an account?", link: "Sign in", href: "/signin" };
  return (
    <main className="auth-shell relative min-h-screen overflow-hidden">
      {/* Light in the room: gold from the top left, cool from the bottom right. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(55% 45% at 8% 0%, rgba(217,169,63,0.20), transparent 62%), radial-gradient(45% 45% at 100% 100%, rgba(38,150,170,0.14), transparent 60%)" }}
      />

      <div className="relative mx-auto grid min-h-screen max-w-[1440px] grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:p-7">
        <section className="flex min-w-0 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1">
            <Link href="/signin" aria-label="Leon Guarding — sign in">
              <Image src="/brand/leon-logo-light.png" alt="Leon Guarding" width={746} height={317} priority className="h-10 w-auto sm:h-11" />
            </Link>
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {other.text}{" "}
              <Link href={other.href} className="font-semibold underline-offset-4 hover:underline" style={{ color: "var(--accent-text)" }}>
                {other.link}
              </Link>
            </p>
          </header>

          <div className="flex flex-1 items-start justify-center py-8 sm:py-12 lg:items-center">
            <div className="auth-glass w-full max-w-[460px] rounded-[28px] p-6 sm:p-8">
              <nav aria-label="Account" className="grid grid-cols-2 rounded-full p-1 text-[13px]" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid var(--hairline)" }}>
                {(
                  [
                    ["signin", "/signin", "Sign in"],
                    ["signup", "/signup", "Create account"],
                  ] as const
                ).map(([id, href, label]) => (
                  <Link
                    key={id}
                    href={href}
                    aria-current={active === id ? "page" : undefined}
                    className="rounded-full px-3 py-2 text-center font-semibold transition-colors"
                    style={active === id ? { background: "rgba(255,255,255,0.10)", color: "var(--text-primary)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)" } : { color: "var(--text-muted)" }}
                  >
                    {label}
                  </Link>
                ))}
              </nav>

              <h1 className="mt-7 text-[26px] leading-tight font-semibold tracking-tight sm:text-[28px]">{title}</h1>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {intro}
              </p>

              <div className="mt-6">{children}</div>
            </div>
          </div>

          <footer className="px-1 pb-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            © {new Date().getFullYear()} Leon Guarding &amp; FM · For Leon Guarding staff, officers and clients. Every sign-in is recorded.
          </footer>
        </section>

        <Showcase />
      </div>
    </main>
  );
}

/** The right-hand showcase, on large screens: decoration only, so hidden from screen readers. */
function Showcase() {
  return (
    <aside aria-hidden className="relative hidden min-h-[640px] overflow-hidden rounded-[32px] lg:block" style={{ background: "linear-gradient(165deg, #0d1a20 0%, #081015 45%, #050709 100%)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {/* Teal light falling across the room, as in the reference. */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(60% 40% at 70% 18%, rgba(56,170,190,0.30), transparent 70%), radial-gradient(35% 30% at 30% 55%, rgba(217,169,63,0.14), transparent 70%)" }} />
      <div className="auth-floor absolute inset-x-[-20%] top-[58%] h-[70%]" />
      {/* Points of light. */}
      {[
        [14, 22],
        [82, 12],
        [66, 44],
        [22, 70],
        [88, 64],
        [48, 16],
      ].map(([x, y], i) => (
        <span key={i} className="absolute h-1.5 w-1.5 rounded-full" style={{ left: `${x}%`, top: `${y}%`, background: i % 2 ? "#7fd4e0" : "#f2d27f", boxShadow: `0 0 14px 4px ${i % 2 ? "rgba(127,212,224,0.45)" : "rgba(242,210,127,0.45)"}` }} />
      ))}

      {/* The shield, lit. */}
      <div className="auth-float-slow absolute top-[9%] left-1/2 -translate-x-1/2">
        <div className="absolute inset-0 -m-10 rounded-full" style={{ background: "radial-gradient(circle, rgba(217,169,63,0.35), transparent 65%)" }} />
        <Image src="/brand/leon-shield.png" alt="" width={253} height={317} className="relative h-40 w-auto drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)]" />
      </div>

      {/* The live board, as glass. */}
      <div className="auth-glass auth-float absolute top-[42%] left-1/2 w-[64%] max-w-[440px] -translate-x-1/2 rounded-2xl p-5">
        <div className="flex items-center justify-between text-[11px]" style={{ color: "#a9b6bb" }}>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: "#7fd896", boxShadow: "0 0 8px #7fd896" }} /> Live board
          </span>
          <span>Tonight · 22:40</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {[
            ["On duty", "42"],
            ["Sites covered", "18"],
            ["Check calls on time", "98.6%"],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[10px]" style={{ color: "#8fa0a6" }}>
                {k}
              </p>
              <p className="text-[22px] font-semibold tracking-tight text-white">{v}</p>
            </div>
          ))}
        </div>
        <svg viewBox="0 0 300 70" preserveAspectRatio="none" className="mt-3 h-16 w-full">
          <defs>
            <linearGradient id="auth-gold" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#e9c86f" stopOpacity="0.35" />
              <stop offset="1" stopColor="#e9c86f" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 52 L30 46 L60 50 L90 34 L120 38 L150 24 L180 30 L210 18 L240 22 L270 12 L300 16 L300 70 L0 70 Z" fill="url(#auth-gold)" />
          <path d="M0 52 L30 46 L60 50 L90 34 L120 38 L150 24 L180 30 L210 18 L240 22 L270 12 L300 16" fill="none" stroke="#e9c86f" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <path d="M0 60 L30 58 L60 54 L90 56 L120 48 L150 50 L180 42 L210 44 L240 36 L270 38 L300 30" fill="none" stroke="#7fd4e0" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      {/* Small glass tiles, floating. */}
      <Tile className="auth-float top-[30%] left-[7%]" icon="✓" tone="#7fd896" title="SIA verified" sub="Checked against the register" />
      <Tile className="auth-float-slow top-[24%] right-[7%]" icon="◎" tone="#7fd4e0" title="Confirmed at site" sub="Booked on 21:58" />
      <Tile className="auth-float-slow bottom-[24%] left-[9%]" icon="★" tone="#e9c86f" title="BS 7858 screening" sub="Five years, verified" />
      <Tile className="auth-float right-[8%] bottom-[20%]" icon="⚑" tone="#f59a9a" title="Needs attention" sub="Fire exit lock, Depot 7" />

      <div className="absolute inset-x-10 bottom-9">
        <p className="text-[26px] leading-tight font-semibold tracking-tight text-white">
          Every site. Every officer.
          <br />
          <span style={{ background: "linear-gradient(90deg, #f2d27f, #d9a93f)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>One secure place.</span>
        </p>
        <p className="mt-2 max-w-md text-[13px]" style={{ color: "#a9b6bb" }}>
          Live cover, screening and compliance for Leon Guarding — for our teams, our officers and our clients.
        </p>
      </div>
    </aside>
  );
}

function Tile({ className, icon, tone, title, sub }: { className: string; icon: string; tone: string; title: string; sub: string }) {
  return (
    <div className={`auth-glass absolute flex items-center gap-3 rounded-2xl px-3.5 py-3 ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl text-[15px]" style={{ background: "rgba(0,0,0,0.35)", color: tone, boxShadow: `0 0 18px -4px ${tone}` }}>
        {icon}
      </span>
      <span>
        <span className="block text-[12px] font-semibold text-white">{title}</span>
        <span className="block text-[11px]" style={{ color: "#a9b6bb" }}>
          {sub}
        </span>
      </span>
    </div>
  );
}
