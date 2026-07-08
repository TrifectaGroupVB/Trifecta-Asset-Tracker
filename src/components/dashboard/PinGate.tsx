"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { verifyPin } from "@/app/dashboard/auth-actions";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;

export function PinGate({
  title = "Dashboard",
  subtitle = "Enter the 6-digit PIN",
}: {
  title?: string;
  subtitle?: string;
} = {}) {
  const router = useRouter();
  const [digits, setDigits] = useState("");
  const [shaking, setShaking] = useState(false);
  // "Checking" is derived: 6 digits are in flight until success (refresh)
  // or the wrong-PIN shake clears them.
  const checking = digits.length === 6 && !shaking;

  // Submit via effect so rapid taps (which batch into one render) can't
  // race the click handler's view of the digits.
  useEffect(() => {
    if (digits.length !== 6) return;
    let cancelled = false;
    const reject = () => {
      if (cancelled) return;
      setShaking(true);
      setTimeout(() => {
        setShaking(false);
        setDigits("");
      }, 400);
    };
    verifyPin(digits)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) router.refresh();
        else reject();
      })
      .catch(reject);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  function press(key: string) {
    if (checking || shaking) return;
    setDigits((prev) => {
      if (key === "⌫") return prev.slice(0, -1);
      if (!key || prev.length >= 6) return prev;
      return prev + key;
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center p-6">
      <h1 className="text-center font-display text-2xl font-semibold uppercase tracking-wide">
        {title}
      </h1>
      <p className="mt-1 text-center text-sm text-text-muted">{subtitle}</p>

      <div
        aria-label={`${digits.length} of 6 digits entered`}
        className={`mt-8 flex gap-3 ${shaking ? "animate-shake" : ""}`}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={`size-4 rounded-full border ${
              i < digits.length ? "border-accent bg-accent" : "border-border bg-surface"
            }`}
          />
        ))}
      </div>

      <div className="mt-10 grid w-full grid-cols-3 gap-2">
        {KEYS.map((key, i) =>
          key === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(key)}
              aria-label={key === "⌫" ? "Delete last digit" : key}
              className="h-16 rounded-sm border border-border bg-surface font-mono text-2xl text-text active:bg-border"
            >
              {key}
            </button>
          )
        )}
      </div>

      {checking && <p className="mt-6 text-sm text-text-muted">Checking…</p>}
    </main>
  );
}
