import Link from "next/link";

/** Brand navy, the same as the app icon. Fixed in both themes. */
export const BRAND = "#1f3a5f";

function ShieldMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="rgba(255,255,255,0.12)" />
      <path
        d="M16 5.5 25 9v7.6c0 5.2-3.6 9.1-9 10.9-5.4-1.8-9-5.7-9-10.9V9z"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="m11.8 16.2 3.1 3.2 5.5-6"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const HIGHLIGHTS = [
  "BS 7858:2019 screening built into recruitment",
  "Scheduling, live operations and compliance in one place",
  "Every action recorded against the role you work as",
];

/**
 * The frame shared by sign-in and sign-up: the brand panel on the left, the
 * form on the right, and a two-way switch between them at the top so it is
 * always obvious which of the two you are on.
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
  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section
        className="relative flex min-w-0 flex-col justify-between overflow-hidden px-6 py-8 text-white sm:px-10 lg:sticky lg:top-0 lg:h-screen lg:px-12 lg:py-12"
        style={{ background: BRAND }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 85% 10%, rgba(255,255,255,0.10), transparent 45%), linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "auto, 32px 32px, 32px 32px",
          }}
        />

        <div className="relative flex items-center gap-3">
          <ShieldMark />
          <div>
            <p className="text-[13px] font-semibold tracking-tight">Leon Guarding &amp; FM</p>
            <p className="text-[11px] text-white/60">Workforce &amp; Operations</p>
          </div>
        </div>

        <div className="relative mt-10 max-w-md lg:mt-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            One platform for your people, sites and screening.
          </h1>
          <ul className="mt-6 hidden space-y-3 sm:block">
            {HIGHLIGHTS.map((h) => (
              <li key={h} className="flex items-start gap-3 text-[13px] text-white/80">
                <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true">
                  <circle cx="8" cy="8" r="8" fill="rgba(255,255,255,0.14)" />
                  <path
                    d="m5 8.2 2 2 4-4.4"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {h}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-10 hidden text-[11px] text-white/50 lg:block">
          © {new Date().getFullYear()} Leon Guarding &amp; FM. Internal use only.
        </p>
      </section>

      <section className="flex min-w-0 items-start justify-center px-4 py-10 sm:px-8 lg:items-center lg:py-12">
        <div className="w-full max-w-md">
          <nav
            aria-label="Account"
            className="grid grid-cols-2 rounded-lg border p-1 text-[13px]"
            style={{ borderColor: "var(--hairline)", background: "var(--wash)" }}
          >
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
                className="rounded-md px-3 py-1.5 text-center font-medium transition-colors"
                style={
                  active === id
                    ? {
                        background: "var(--surface-1)",
                        color: "var(--text-primary)",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                      }
                    : { color: "var(--text-muted)" }
                }
              >
                {label}
              </Link>
            ))}
          </nav>

          <h2 className="mt-8 text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {intro}
          </p>

          <div className="mt-6">{children}</div>
        </div>
      </section>
    </main>
  );
}
