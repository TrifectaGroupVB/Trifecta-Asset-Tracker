import { deleteCredential } from "@/app/dashboard/webauthn-actions";
import { BiometricEnrollButton } from "@/components/dashboard/BiometricEnrollButton";
import { CompressingForm } from "@/components/dashboard/CompressingForm";
import { PinGate } from "@/components/dashboard/PinGate";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { hasDashboardSession } from "@/lib/session";
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  NOTIFICATION_KEYS,
  NOTIFICATION_LABELS,
  getEnvStatus,
  getFeatureFlags,
  getNotificationFlags,
} from "@/lib/settings";
import {
  changePin,
  resetLocationPrintLogo,
  sendTestEmail,
  toggleFeature,
  toggleNotification,
  updateAdminEmail,
  updateLocation,
  uploadLocationPrintLogo,
} from "./actions";

const MESSAGES: Record<string, { text: string; kind: "ok" | "error" }> = {
  "wrong-pin": { text: "Current PIN is wrong.", kind: "error" },
  "bad-pin": { text: "New PIN must be exactly 6 digits.", kind: "error" },
  "pin-changed": { text: "PIN updated.", kind: "ok" },
  "bad-email": { text: "That doesn't look like an email address.", kind: "error" },
  "email-saved": { text: "Admin email updated.", kind: "ok" },
  "test-sent": { text: "Test email sent — check the inbox.", kind: "ok" },
  "no-email": { text: "Set an admin email first.", kind: "error" },
  "no-resend": {
    text: "No RESEND_API_KEY is set, so nothing would actually send.",
    kind: "error",
  },
  "logo-saved": { text: "Tag logo updated.", kind: "ok" },
  "logo-reset": { text: "Tag logo reset to default.", kind: "ok" },
  "logo-upload": {
    text: "That logo didn't upload — use a PNG or JPG image.",
    kind: "error",
  },
};

const inputClass =
  "h-12 w-full rounded-sm border border-border bg-surface px-3 placeholder:text-text-muted";
const sectionClass = "mt-8";
const headingClass =
  "font-display text-xs uppercase tracking-widest text-text-muted";

// A switch is a one-button form: the button carries the state it's switching
// *to*, so it works with JavaScript off and there's no client component.
function Toggle({
  action,
  keyName,
  on,
  title,
  blurb,
}: {
  action: (formData: FormData) => Promise<void>;
  keyName: string;
  on: boolean;
  title: string;
  blurb: string;
}) {
  return (
    <li className="rounded-sm border border-border p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold uppercase tracking-wide">
            {title}
          </p>
          <p className="mt-1 text-sm text-text-muted">{blurb}</p>
        </div>
        <form action={action} className="shrink-0">
          <input type="hidden" name="key" value={keyName} />
          <input type="hidden" name="next" value={on ? "off" : "on"} />
          <button
            type="submit"
            aria-label={`Turn ${title} ${on ? "off" : "on"}`}
            className={`h-12 w-20 rounded-sm border font-display text-sm uppercase tracking-wide ${
              on
                ? "border-status-completed/60 text-status-completed"
                : "border-border text-text-muted"
            }`}
          >
            {on ? "On" : "Off"}
          </button>
        </form>
      </div>
    </li>
  );
}

function EnvRow({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span
        aria-hidden
        className={`size-2 shrink-0 rounded-full ${
          ok ? "bg-status-completed" : "bg-text-muted"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          {label}{" "}
          <span className={ok ? "text-status-completed" : "text-text-muted"}>
            {ok ? "set" : "not set"}
          </span>
        </p>
        <p className="text-xs text-text-muted">{note}</p>
      </div>
    </li>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  if (!(await hasDashboardSession())) return <PinGate />;

  const { error, ok } = await searchParams;
  const message = MESSAGES[error ?? ok ?? ""];

  const [adminEmail, credentials, locations, features, notifications] =
    await Promise.all([
      prisma.setting.findUnique({ where: { key: "adminEmail" } }),
      prisma.webAuthnCredential.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.location.findMany({ orderBy: { name: "asc" } }),
      getFeatureFlags(),
      getNotificationFlags(),
    ]);
  const env = getEnvStatus();

  return (
    <main className="p-4 pb-16">
      <h1 className="font-display text-3xl font-semibold uppercase tracking-wide">
        Settings
      </h1>
      <p className="mt-1 text-sm text-text-muted">
        Back-end controls. Admin is for the equipment and tech rosters.
      </p>

      {message && (
        <p
          className={`mt-3 rounded-sm border px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "border-status-completed/50 text-status-completed"
              : "border-danger/50 text-danger"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* Features */}
      <section className={sectionClass}>
        <h2 className={headingClass}>Features</h2>
        <p className="mt-1 text-sm text-text-muted">
          Switch the AI-assisted extras off without a redeploy. Everything they
          add is optional — the hand-typed paths never go away.
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {FEATURE_KEYS.map((key) => (
            <Toggle
              key={key}
              action={toggleFeature}
              keyName={key}
              on={features[key]}
              title={FEATURE_LABELS[key].title}
              blurb={FEATURE_LABELS[key].blurb}
            />
          ))}
        </ul>
        {!env.anthropic && (
          <p className="mt-2 rounded-sm border border-danger/50 px-3 py-2 text-sm text-danger">
            Both of these need ANTHROPIC_API_KEY set in the Vercel project.
            Without it they stay switched off in the app — the tag wizard says
            so and falls back to typing the fields in, and reading manuals is
            unavailable.
          </p>
        )}
      </section>

      {/* Notifications */}
      <section className={sectionClass}>
        <h2 className={headingClass}>Email notifications</h2>
        <p className="mt-1 text-sm text-text-muted">
          Which events actually send mail. Turning one off doesn&rsquo;t change
          anything else — the request or order is still recorded.
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {NOTIFICATION_KEYS.map((key) => (
            <Toggle
              key={key}
              action={toggleNotification}
              keyName={key}
              on={notifications[key]}
              title={NOTIFICATION_LABELS[key].title}
              blurb={NOTIFICATION_LABELS[key].blurb}
            />
          ))}
        </ul>

        <form
          action={updateAdminEmail}
          className="mt-3 flex flex-col gap-2 rounded-sm border border-border p-3"
        >
          <label htmlFor="adminEmail" className={headingClass}>
            Admin email (part orders and urgent alerts go here)
          </label>
          <input
            id="adminEmail"
            name="adminEmail"
            type="email"
            defaultValue={adminEmail?.value ?? ""}
            required
            className={inputClass}
          />
          <button
            type="submit"
            className="h-12 rounded-sm border border-border bg-surface font-display uppercase tracking-wide"
          >
            Save email
          </button>
        </form>

        <form action={sendTestEmail} className="mt-2">
          <button
            type="submit"
            className="h-12 w-full rounded-sm border border-accent font-display uppercase tracking-wide text-accent"
          >
            Send a test email
          </button>
        </form>
      </section>

      {/* Security */}
      <section className={sectionClass}>
        <h2 className={headingClass}>Dashboard PIN</h2>
        <form
          action={changePin}
          className="mt-2 flex flex-col gap-2 rounded-sm border border-border p-3"
        >
          <label htmlFor="currentPin" className="sr-only">
            Current PIN
          </label>
          <input
            id="currentPin"
            name="currentPin"
            type="password"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="Current PIN"
            required
            className={`${inputClass} font-mono`}
          />
          <label htmlFor="newPin" className="sr-only">
            New PIN
          </label>
          <input
            id="newPin"
            name="newPin"
            type="password"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="New 6-digit PIN"
            required
            className={`${inputClass} font-mono`}
          />
          <p className="text-xs text-text-muted">
            Changing the PIN signs out every other device immediately. This one
            stays unlocked.
          </p>
          <button
            type="submit"
            className="h-12 rounded-sm border border-border bg-surface font-display uppercase tracking-wide"
          >
            Change PIN
          </button>
        </form>
      </section>

      {/* Biometric unlock */}
      <section className={sectionClass}>
        <h2 className={headingClass}>Biometric unlock</h2>
        <p className="mt-1 text-sm text-text-muted">
          Enrolled devices can skip the PIN pad with Face ID / Touch ID /
          fingerprint. The PIN still works everywhere as a fallback.
        </p>
        {credentials.length > 0 && (
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {credentials.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{c.deviceLabel}</p>
                  <p className="text-xs text-text-muted">
                    Enrolled {formatDate(c.createdAt)}
                  </p>
                </div>
                <form action={deleteCredential}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    className="h-12 rounded-sm border border-danger/50 px-4 font-display text-sm uppercase tracking-wide text-danger"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <BiometricEnrollButton />
        </div>
      </section>

      {/* Locations */}
      <section className={sectionClass}>
        <h2 className={headingClass}>Locations</h2>
        <ul className="mt-2 flex flex-col gap-3">
          {locations.map((l) => (
            <li key={l.id} className="rounded-sm border border-border p-3">
              <form action={updateLocation} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={l.id} />
                <input
                  name="name"
                  defaultValue={l.name}
                  aria-label="Name"
                  required
                  className={inputClass}
                />
                <input
                  name="address"
                  defaultValue={l.address}
                  aria-label="Address"
                  required
                  className={inputClass}
                />
                <button
                  type="submit"
                  className="h-12 rounded-sm border border-border bg-surface font-display uppercase tracking-wide"
                >
                  Save
                </button>
              </form>

              {/* Tag print logo — uploadable per location, prints in B&W */}
              <div className="mt-4 border-t border-border pt-3">
                <p className={headingClass}>Tag print logo</p>
                <p className="mt-1 text-sm text-text-muted">
                  Shown in black &amp; white at the top of every QR tag for this
                  location.
                </p>
                {/* Preview on white, grayscaled — a true preview of the sticker */}
                <div className="mt-2 flex h-24 items-center justify-center rounded-sm border border-border bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={l.printLogoUrl ?? l.logoUrl}
                    alt={`${l.name} tag logo`}
                    className="h-full w-auto max-w-full object-contain grayscale"
                  />
                </div>
                <p className="mt-1 font-mono text-xs text-text-muted">
                  {l.printLogoUrl ? "Custom logo" : "Default logo"}
                </p>
                <CompressingForm
                  action={uploadLocationPrintLogo}
                  className="mt-2 flex flex-col gap-2"
                >
                  <input type="hidden" name="id" value={l.id} />
                  <input
                    type="file"
                    name="logo"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    required
                    aria-label={`Upload tag logo for ${l.name}`}
                    className="text-sm text-text-muted file:mr-3 file:h-12 file:rounded-sm file:border file:border-border file:bg-surface file:px-4 file:font-display file:uppercase file:tracking-wide file:text-text"
                  />
                  <button
                    type="submit"
                    className="h-12 rounded-sm border border-border bg-surface font-display uppercase tracking-wide"
                  >
                    Upload logo
                  </button>
                </CompressingForm>
                {l.printLogoUrl && (
                  <form action={resetLocationPrintLogo} className="mt-2">
                    <input type="hidden" name="id" value={l.id} />
                    <button
                      type="submit"
                      className="h-12 w-full rounded-sm border border-border font-display uppercase tracking-wide text-text-muted"
                    >
                      Use default logo
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Environment */}
      <section className={sectionClass}>
        <h2 className={headingClass}>Environment</h2>
        <p className="mt-1 text-sm text-text-muted">
          Which keys the deployment has. Values are never shown here — change
          them in the Vercel project settings.
        </p>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          <EnvRow
            label="ANTHROPIC_API_KEY"
            ok={env.anthropic}
            note="Nameplate scanning and reading parts out of manuals. Without it both stay off."
          />
          <EnvRow
            label="RESEND_API_KEY"
            ok={env.resend}
            note="Sending email. Without it, messages are logged instead of sent."
          />
          <EnvRow
            label="BLOB_READ_WRITE_TOKEN"
            ok={env.blob}
            note="Photo and PDF storage. Without it, uploads go to local disk."
          />
          <li className="py-2">
            <p className="text-sm">
              BASE_URL{" "}
              <span className="font-mono text-xs text-text-muted">
                {env.baseUrl ?? "not set"}
              </span>
            </p>
            <p className="text-xs text-text-muted">
              What every QR sticker points at. Changing it after stickers are
              printed breaks them.
            </p>
          </li>
        </ul>
      </section>
    </main>
  );
}
