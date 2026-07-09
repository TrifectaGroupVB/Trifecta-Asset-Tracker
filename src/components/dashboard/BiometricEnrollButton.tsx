"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getRegistrationOptions, verifyRegistration } from "@/app/dashboard/webauthn-actions";

export function BiometricEnrollButton() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      const optionsJSON = await getRegistrationOptions();
      const response = await startRegistration({ optionsJSON });
      const result = await verifyRegistration(response, label);
      if (result.ok) {
        setLabel("");
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Setup was cancelled or this device doesn't support it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-dashed border-border p-3">
      <label
        htmlFor="device-label"
        className="font-display text-xs uppercase tracking-widest text-text-muted"
      >
        Name this device
      </label>
      <input
        id="device-label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="e.g. Parker's iPhone"
        className="h-12 w-full rounded-sm border border-border bg-surface px-3 placeholder:text-text-muted"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={enroll}
        disabled={busy || !label.trim()}
        className="h-12 rounded-sm bg-accent font-display font-semibold uppercase tracking-wide text-bg disabled:opacity-60"
      >
        {busy ? "Follow the prompt…" : "Enable Face ID / Touch ID"}
      </button>
    </div>
  );
}
