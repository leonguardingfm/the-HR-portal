"use client";

import { useState, useTransition } from "react";
import { changeRole } from "@/app/signin/actions";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { Card } from "@/components/ui/Card";
import { useFormAction } from "@/components/ui/useFormAction";
import { changePassword, saveSound, saveTheme } from "@/lib/actions/settings";
import type { ActionResult } from "@/lib/actions/types";
import { THEMES, TINTS, themeAttributes, themeOf, type ThemeSpec } from "@/lib/core/themes";
import { ROLE_DEPARTMENT, ROLE_LABELS } from "@/lib/labels";
import type { Role } from "@/lib/types";
import { TwoFactorCard } from "./TwoFactorCard";

type Props = {
  me: { name: string; username: string | null; email: string | null; activeRole: Role; roles: Role[] };
  theme: string;
  soundOn: boolean;
  hearsHub: boolean;
  hasPassword: boolean;
  twoFactor: { enabledAt: string | null; required: boolean };
  must: "password" | "2fa" | null;
};

/** Put a theme on the page at once — the save follows. */
function apply(id: string) {
  const root = document.documentElement;
  const attrs = themeAttributes(id);
  if (attrs["data-theme"]) root.setAttribute("data-theme", attrs["data-theme"]);
  else root.removeAttribute("data-theme");
  if (attrs["data-tint"]) root.setAttribute("data-tint", attrs["data-tint"]);
  else root.removeAttribute("data-tint");
}

function Swatch({ t, chosen, onPick }: { t: ThemeSpec; chosen: boolean; onPick: () => void }) {
  const s = t.swatch;
  const split = t.mode === "system";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      onClick={onPick}
      className="flex flex-col gap-2 rounded-lg border p-2 text-left transition-shadow"
      style={{ borderColor: chosen ? "var(--series-1)" : "var(--hairline)", boxShadow: chosen ? "0 0 0 2px var(--series-1)" : undefined, background: "var(--surface-1)" }}
    >
      <span aria-hidden className="relative block h-16 overflow-hidden rounded-md border" style={{ background: split ? `linear-gradient(135deg, #f9f9f7 50%, #0d0d0d 50%)` : s.page, borderColor: "rgba(0,0,0,0.08)" }}>
        {!split && (
          <>
            <span className="absolute top-2 left-2 h-2 w-10 rounded-full" style={{ background: s.accent }} />
            <span className="absolute top-6 right-2 bottom-2 left-2 rounded" style={{ background: s.card, boxShadow: "0 0 0 1px rgba(0,0,0,0.06)" }}>
              <span className="absolute top-2 left-2 h-1.5 w-12 rounded-full" style={{ background: s.ink, opacity: 0.7 }} />
              <span className="absolute top-5 left-2 h-1.5 w-8 rounded-full" style={{ background: s.ink, opacity: 0.35 }} />
            </span>
          </>
        )}
      </span>
      <span className="flex items-center justify-between gap-2 text-[12px] font-medium">
        {t.label}
        {chosen && (
          <span aria-hidden style={{ color: "var(--accent-text)" }}>
            ✓
          </span>
        )}
      </span>
    </button>
  );
}

export function SettingsView({ me, theme: initialTheme, soundOn: initialSound, hearsHub, hasPassword, twoFactor, must }: Props) {
  const [theme, setTheme] = useState(initialTheme);
  const [sound, setSound] = useState(initialSound);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const pick = (id: string) => {
    setTheme(id);
    apply(id);
    start(async () => setNotice(await saveTheme(id)));
  };
  const plain = THEMES.filter((t) => !t.tint);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">My settings</h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Yours only, and they follow you to any device you sign in on.
        </p>
      </header>

      {must && (
        <div role="alert" className="rounded-lg border px-4 py-3 text-[13px]" style={{ borderColor: "var(--status-warning)", background: "var(--wash-warning)" }}>
          <strong>{must === "password" ? "Choose a new password before you carry on." : "Set up two-factor sign-in before you carry on."}</strong>{" "}
          {must === "password" ? "Your password was reset, so the temporary one works only this once." : "The Managing Director has made it required for your role."}
        </div>
      )}

      {must && (
        <div className="grid gap-5 md:grid-cols-2">
          {must === "password" && hasPassword && <PasswordCard />}
          {must === "2fa" && <TwoFactorCard enabledAt={twoFactor.enabledAt} required={twoFactor.required} />}
        </div>
      )}

      <Card title="Theme" subtitle={`Now: ${themeOf(theme).label}${pending ? " — saving…" : ""}`}>
        <div role="radiogroup" aria-label="Theme" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {plain.map((t) => (
              <Swatch key={t.id} t={t} chosen={theme === t.id} onPick={() => pick(t.id)} />
            ))}
          </div>
          <div>
            <p className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
              Colour themes — tinted on a light page, or shaded on a dark one
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {TINTS.map((c) => (
                <fieldset key={c.id} className="space-y-2 rounded-lg border p-2" style={{ borderColor: "var(--hairline)" }}>
                  <legend className="px-1 text-[12px] font-semibold">{c.label}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {THEMES.filter((t) => t.tint === c.id).map((t) => (
                      <Swatch key={t.id} t={{ ...t, label: t.mode === "light" ? "Tinted" : "Shaded" }} chosen={theme === t.id} onPick={() => pick(t.id)} />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Red, amber, green and blue keep their meaning in every theme: a colour theme changes the page, never what an alert means.
          </p>
          {notice && <Result state={notice} />}
        </div>
      </Card>

      {hearsHub && (
        <Card title="Notifications" subtitle="The Performance hub's notifications in the top-right corner.">
          <label className="flex items-center justify-between gap-3 text-[13px]">
            <span>
              <span className="font-medium">Play a sound</span>
              <span className="block text-[12px]" style={{ color: "var(--text-secondary)" }}>
                Two soft beeps for a warning, three for something critical. The Control Room alarm is separate and always sounds.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={sound}
              onChange={(e) => {
                const on = e.target.checked;
                setSound(on);
                start(async () => setNotice(await saveSound(on)));
              }}
              className="h-5 w-5 shrink-0"
            />
          </label>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="My account">
          <dl className="grid grid-cols-[minmax(6.5rem,auto)_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            <dt style={{ color: "var(--text-secondary)" }}>Name</dt>
            <dd>{me.name}</dd>
            <dt style={{ color: "var(--text-secondary)" }}>Username</dt>
            <dd>{me.username ?? "—"}</dd>
            <dt style={{ color: "var(--text-secondary)" }}>Email</dt>
            <dd className="break-words">{me.email ?? "—"}</dd>
            <dt style={{ color: "var(--text-secondary)" }}>Department</dt>
            <dd>{ROLE_DEPARTMENT[me.activeRole]}</dd>
          </dl>
          {me.roles.length > 1 && (
            <form action={changeRole} className="mt-4 space-y-1.5">
              <input type="hidden" name="from" value="/settings" />
              <p className="text-[12px] font-medium">Working as</p>
              {me.roles.map((r) => (
                <label key={r} className="flex items-center gap-2 text-[13px]">
                  <input type="radio" name="role" value={r} defaultChecked={r === me.activeRole} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="h-4 w-4" />
                  {ROLE_LABELS[r]} <span style={{ color: "var(--text-muted)" }}>· {ROLE_DEPARTMENT[r]}</span>
                </label>
              ))}
            </form>
          )}
        </Card>

        {hasPassword && must !== "password" && <PasswordCard />}
      </div>

      {must !== "2fa" && <TwoFactorCard enabledAt={twoFactor.enabledAt} required={twoFactor.required} />}
    </div>
  );
}

function PasswordCard() {
  const pw = useFormAction(changePassword);
  return (
    <Card title="Change password">
      <form {...pw.form} className="space-y-3">
        <label className="block text-[12px] font-medium">
          Current password
          <input name="current" type="password" autoComplete="current-password" required className={`${input} mt-1`} style={inputStyle} />
        </label>
        <label className="block text-[12px] font-medium">
          New password (at least 10 characters)
          <input name="next" type="password" autoComplete="new-password" required minLength={10} className={`${input} mt-1`} style={inputStyle} />
        </label>
        <label className="block text-[12px] font-medium">
          New password again
          <input name="confirm" type="password" autoComplete="new-password" required minLength={10} className={`${input} mt-1`} style={inputStyle} />
        </label>
        <button type="submit" disabled={pw.pending} className="h-10 w-full rounded-md text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--series-1)" }}>
          {pw.pending ? "Changing…" : "Change password"}
        </button>
        <Result state={pw.state} />
      </form>
    </Card>
  );
}
