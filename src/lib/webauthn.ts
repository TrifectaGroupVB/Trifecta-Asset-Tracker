// Shared WebAuthn "relying party" config, derived from BASE_URL so this
// works unmodified in local dev (localhost) and in production (the real
// domain) — WebAuthn ties credentials to this exact hostname + origin.
export function getRpConfig() {
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  const url = new URL(baseUrl);
  return {
    rpID: url.hostname,
    rpName: "Trifecta Asset Tracker",
    origin: url.origin,
  };
}
