"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { verifyPin } from "@/app/dashboard/auth-actions";
import {
  getAuthenticationOptions,
  hasAnyCredentials,
  verifyAuthentication,
} from "@/app/dashboard/webauthn-actions";
import { AppHeader } from "@/components/AppHeader";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;

function FaceIdIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path
        d="M7 3.5H5.5A2 2 0 0 0 3.5 5.5V7M17 3.5h1.5a2 2 0 0 1 2 2V7M7 20.5H5.5a2 2 0 0 1-2-2V17M17 20.5h1.5a2 2 0 0 0 2-2V17"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 10v1M15 10v1" strokeLinecap="round" />
      <path d="M9 15c1 .8 2 1 3 1s2-.2 3-1" strokeLinecap="round" />
    </svg>
  );
}

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
  const [showBiometric, setShowBiometric] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  // "Checking" is derived: 6 digits are in flight until success (refresh)
  // or the wrong-PIN shake clears them.
  const checking = digits.length === 6 && !shaking;

  // Only offer the shortcut if this browser can do platform biometrics AND
  // at least one device has actually been enrolled (else the button would
  // just fail every time).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.PublicKeyCredential) return;
      const [platformOk, anyEnrolled] = await Promise.all([
        window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.() ??
          Promise.resolve(false),
        hasAnyCredentials(),
      ]);
      if (!cancelled && platformOk && anyEnrolled) setShowBiometric(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function unlockWithBiometrics() {
    setBiometricBusy(true);
    try {
      const optionsJSON = await getAuthenticationOptions();
      const response = await startAuthentication({ optionsJSON });
      const result = await verifyAuthentication(response);
      if (result.ok) router.refresh();
      // On failure, just fall back to the PIN pad silently — biometric
      // cancellation is a normal, frequent thing, not an error worth
      // interrupting someone over.
    } catch {
      // user cancelled the platform prompt, or it errored — fall back to PIN
    } finally {
      setBiometricBusy(false);
    }
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-sm flex-col items-center justify-center p-6">
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

      {showBiometric && (
        <button
          type="button"
          onClick={unlockWithBiometrics}
          disabled={biometricBusy}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-sm border border-border font-display text-sm uppercase tracking-wide text-text-muted disabled:opacity-60"
        >
          <FaceIdIcon />
          {biometricBusy ? "Checking…" : "Use Face ID / Touch ID"}
        </button>
      )}
      </main>
    </>
  );
}
