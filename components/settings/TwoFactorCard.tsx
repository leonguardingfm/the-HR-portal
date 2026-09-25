"use client";

import qrcode from "qrcode-generator";
import { useState, useTransition } from "react";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { Card } from "@/components/ui/Card";
import { useFormAction } from "@/components/ui/useFormAction";
import { confirmTwoFactor, startTwoFactor, turnOffTwoFactor } from "@/lib/actions/settings";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Two-factor sign-in, set up by the person themselves: scan a QR code with an
 * authenticator app, type one code back to prove it works. Until that code is
 * accepted nothing changes, so a half-finished set-up cannot lock anyone out.
 */
export function TwoFactorCard({ enabledAt, required }: { enabledAt: string | null; required: boolean }) {
  const [setup, setSetup] = useState<{ uri: string; secret: string } | null>(null);
  const [startState, setStartState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const confirm = useFormAction(confirmTwoFactor);
  const off = useFormAction(turnOffTwoFactor);
  const qrSvg = (() => {
    if (!setup) return "";
    const qr = qrcode(0, "M");
    qr.addData(setup.uri);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  })();

  return (
    <Card title="Two-factor sign-in" subtitle="A six-digit code from an app on your phone, as well as your password. It stops anyone who learns your password from getting in.">
      {enabledAt ? (
        <div className="space-y-3 text-[13px]">
          <p>
            <span style={{ color: "var(--good-text)" }}>✓ On</span> since {new Date(enabledAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
            {required && <span style={{ color: "var(--text-secondary)" }}> Your role must use it.</span>}
          </p>
          {!required && (
            <form {...off.form} className="flex flex-wrap items-end gap-2">
              <label className="block text-[12px] font-medium">
                Code from your app, to turn it off
                <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className={`${input} mt-1 w-40`} style={inputStyle} />
              </label>
              <button type="submit" disabled={off.pending} className="h-9 rounded-md border px-3 text-[12px] font-semibold" style={{ borderColor: "var(--status-critical)", color: "var(--critical-text)" }}>
                Turn off
              </button>
              <Result state={off.state} />
            </form>
          )}
        </div>
      ) : setup ? (
        <div className="grid gap-4 text-[13px] sm:grid-cols-[auto_1fr]">
          <div aria-label="QR code for your authenticator app" className="h-44 w-44 rounded-md bg-white p-1" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5">
              <li>Open an authenticator app — Microsoft Authenticator or Google Authenticator are free.</li>
              <li>Add an account and scan this code. Can’t scan? Type this key instead:</li>
            </ol>
            <code className="block rounded px-2 py-1.5 text-[13px] tracking-wider break-all" style={{ background: "var(--wash-neutral)" }}>
              {setup.secret.replace(/(.{4})/g, "$1 ").trim()}
            </code>
            <form {...confirm.form} className="flex flex-wrap items-end gap-2">
              <label className="block text-[12px] font-medium">
                3. Type the six digits it shows
                <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className={`${input} mt-1 w-40`} style={inputStyle} />
              </label>
              <button type="submit" disabled={confirm.pending} className="h-9 rounded-md px-3 text-[12px] font-semibold text-white" style={{ background: "var(--series-1)" }}>
                {confirm.pending ? "Checking…" : "Turn on"}
              </button>
            </form>
            <Result state={confirm.state} />
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-[13px]">
          <p style={{ color: "var(--text-secondary)" }}>{required ? "Your role must use two-factor. It takes about a minute." : "Off. Recommended for everyone, and essential for anyone who sees screening files."}</p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await startTwoFactor();
                setStartState(r);
                if (r.ok && r.uri && r.secret) setSetup({ uri: r.uri, secret: r.secret });
              })
            }
            className="h-9 rounded-md px-3 text-[12px] font-semibold text-white"
            style={{ background: "var(--series-1)" }}
          >
            {pending ? "…" : "Set up two-factor"}
          </button>
          {startState && !startState.ok && <Result state={startState} />}
        </div>
      )}
    </Card>
  );
}
