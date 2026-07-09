@AGENTS.md

# Trifecta Asset Tracker

Mobile-first web app for managing commercial kitchen equipment and service requests in **one restaurant**. QR tags on equipment link to equipment pages and service-request forms; a PIN-protected dashboard manages requests, techs, parts, and tags.

**Pilot site:** Waterman's Surfside Grille ("Grille" with the E, per their logo), 415 Atlantic Ave, Virginia Beach, VA 23451. Logo: `public/brand/watermans-logo-full.png` (transparent background, works on the dark theme). Used at ~2in wide on sticker sheets (legible there; below ~100px the text blurs, avoid going smaller). `public/brand/watermans-mark.png` is a standalone fish-tail glyph cropped from the full logo — not currently used anywhere, kept in case a future small-format spot (favicon, etc.) needs it; if a real vector/icon version ever comes from their brand assets, prefer that over this crop. Other Trifecta locations will come later — until then, build single-restaurant and pull the restaurant name/address from the `Setting` table (`restaurantName`, `restaurantAddress`), never hardcode it. Note: `Equipment.location` means the spot *within* the restaurant ("Cook line — station 2"); when multi-location arrives it gets its own model, not this field.

---

## STACK (boring and reliable, on purpose)

- **Next.js (App Router) + TypeScript + Tailwind CSS**
- **Postgres (Neon) via Prisma** — `DATABASE_URL` in `.env` (Neon pooled connection string; `@prisma/adapter-pg`). The client in `src/lib/db.ts` is a lazy singleton so `next build` works without a database. The old SQLite era is preserved at `prisma/dev.db.sqlite-backup` + `prisma/migrations-sqlite-backup/` (both gitignored).
- **File storage:** `src/lib/uploads.ts` — Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set (production), `/public/uploads` local disk otherwise (dev). The seed uploads its placeholder assets to Blob when the token is present. Blob image domains are allowed in `next.config.ts`.
- **Email: Resend** for transactional mail (assignment notifications, part order requests). API key from `RESEND_API_KEY` env var. **If no key is set, log the email to the console instead of failing.** Never let missing email config break a request.
- **QR codes:** `qrcode` npm package.
- **Auth:** no auth library. Dashboard is protected by a **6-digit PIN**, checked server-side, stored in an httpOnly session cookie (1-hour expiry — kept short since this can sit on a shared kitchen device). PIN lives in the `Setting` table (`dashboardPin`). **Biometric unlock (Face ID / Touch ID / fingerprint)** is layered on top via WebAuthn (`@simplewebauthn/server` + `@simplewebauthn/browser`) as a faster shortcut past the PIN pad — PIN always still works as a fallback. Enrolled devices live in `WebAuthnCredential` (no per-user accounts; these are "trusted devices for the shared PIN," not per-person identity). RP config (`src/lib/webauthn.ts`) derives from `BASE_URL`, so it works on both localhost and the real domain without changes.

## COMMANDS

- `npm run dev` — dev server
- `npx prisma migrate dev` — apply schema changes, then `npx prisma generate` and **restart the dev server** (the Prisma client singleton on `globalThis` survives hot reload and keeps the stale schema)
- `npx prisma db seed` — run seed (`prisma/seed.ts` via tsx)
- `npx prisma studio` — inspect the DB

## ROUTES

- `/` — home: logo + links to Equipment / Report a problem / Dashboard (static, no DB)
- `/equipment` — public index, `?q=` searches name/model
- `/equipment/[id]` — public detail (QR scan target): DataPlate header, sticky OVERVIEW/MANUALS/PARTS/HISTORY tabs, part-order flow (`EquipmentTabs` client component + `submitPartOrder` server action → emails admin). Shows an "Edit" badge on the DataPlate linking straight to `/dashboard/admin/equipment/[id]` when `hasDashboardSession()` is true (PIN or biometrics — same session cookie either way); absent entirely when unauthenticated, not a link that bounces to a PIN prompt.
- `/request` — public service-request form (one screen). `?equipment={id}` pre-selects. Photo uploads land in `/public/uploads/requests/`. No email on create (per spec — emails are for assignment + part orders)
- `/dashboard` — PIN-gated queue (stats strip, status chips, search, urgent-first sort; URGENT+OPEN+>4h badges pulse). Any dashboard page renders the PIN pad in place when there's no session
- `/dashboard/requests/[id]` — request detail: assign (emails tech, `[URGENT]` subject tag), Assigned → In Progress → Completed (completion writes a ServiceRecord), timeline + append-only notes (`RequestEvent`)
- `/dashboard/admin` — equipment list + techs CRUD + settings (admin email, PIN change) + biometric device enrollment (`BiometricEnrollButton`, list + remove). `/dashboard/admin/equipment/[id]` (or `new`) — full equipment editor (details, photo, specs, manuals-by-file-or-URL, parts w/ vendor links; delete blocked when service history exists)
- `/t/[code]` — **the only URL a QR sticker ever encodes.** Routes by tag state: voided/unknown → "isn't active" page; EQUIPMENT → equipment page; SERVICE_REQUEST → `/request?from={label}`; UNASSIGNED → PIN-gated setup wizard (`TagWizard`: equipment new/existing, or request station). Wizard actions must NOT call revalidatePath — it re-runs the route mid-action and the fresh redirect eats the confirmation screen
- `/dashboard/tags` — batch generator (default 20, max 100), tag table (role badges, points-to, void/restore, reassign→wizard), blanks filter. `/dashboard/tags/print/[batchNumber]` — printable sticker sheet: 2.5in × 3.4in, dashed cut lines, full Waterman's logo above the QR (not overlaid — QR is untouched, no error-correction tradeoff), QR → `{BASE_URL}/t/{code}`, mono code fallback, caption is the `restaurantName` setting + "SCAN ME" (never hardcode the restaurant), pure black on white (print: chrome is `print:hidden`). **Physical dimensions are hand-synced between this page's Tailwind arbitrary-value classes and the constants in `src/lib/stickerExport.ts`** — Tailwind can't consume a shared JS constant, so if one changes, update the other.
- `/dashboard/tags/print/[batchNumber]/export` — Route Handler (not a page) that renders every sticker in the batch as an individual 300 DPI PNG (`src/lib/stickerExport.ts`, via `sharp`) and returns them zipped (`jszip`) for handing off to an outside vinyl/sticker print vendor. One file per sticker since each has a different QR. Text (code/name/scan-me) uses plain system fonts, not the app's Barlow Condensed/JetBrains Mono — acceptable since the logo image carries the actual brand fidelity. PIN-gated same as other dashboard routes, but returns a redirect (no page to render) rather than `PinGate` when unauthenticated. Verified by decoding every PNG in a real downloaded zip — see git history for the test approach if this ever needs re-verifying.

## AUTH

No auth library. `src/lib/session.ts`: session cookie (`tat_session`, httpOnly, **1h**) is `expires.HMAC(expires)` where the HMAC key is derived from the dashboard PIN — changing the PIN invalidates all sessions automatically (changePin re-issues the caller's cookie so they stay in). Server actions all start with a session assert; pages render `PinGate` in place when unauthenticated.

**Biometric unlock (WebAuthn):** `src/app/dashboard/webauthn-actions.ts` — `getRegistrationOptions`/`verifyRegistration` (requires an existing PIN session; enroll a device from Admin), `getAuthenticationOptions`/`verifyAuthentication` (public — this IS the unlock path; on success calls the same `setSessionCookie` as PIN entry, so downstream `hasDashboardSession()` can't tell which method was used). A transient challenge is stashed in a short-lived plain httpOnly cookie (`tat_webauthn_challenge`, 2 min) between the options and verify steps — tampering with it can only break the ceremony, not forge a signature, so it doesn't need HMAC signing like the session cookie does. `PinGate` shows the "Use Face ID / Touch ID" button only when both the browser supports platform authenticators AND at least one device is enrolled (`hasAnyCredentials()`) — otherwise it'd offer a button that always fails. Verified end-to-end (registration + authentication, real signature verification) via a virtual authenticator in one test environment; the actual biometric prompt on a real phone still needs a human to physically approve it — that step can't be scripted.

---

## DESIGN SYSTEM

All colors are Tailwind theme tokens (defined in `src/app/globals.css` via `@theme`). **Never hardcode colors in components** — always use the token classes.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#1A1D21` | page background |
| `surface` | `#24282E` | cards, panels |
| `border` | `#33383F` | borders, dividers |
| `text` | `#E8EAED` | primary text |
| `text-muted` | `#9AA0A8` | secondary text |
| `accent` | `#FF6B1A` | safety orange — primary buttons, urgency, active states **only** |
| `danger` | `#E5484D` | muted red — expired warranty, destructive actions, error text |
| `status-open` | `#FF6B1A` | status: open |
| `status-assigned` | `#FFB020` | status: assigned |
| `status-progress` | `#3B82F6` | status: in progress |
| `status-completed` | `#22C55E` | status: completed |

**Fonts** (via `next/font`, exposed as CSS vars + Tailwind font tokens):
- **Barlow Condensed** (`font-display`) — page titles and equipment names, uppercase, `tracking-wide`
- **Inter** (`font-sans`) — body
- **JetBrains Mono** (`font-mono`) — model numbers, serial numbers, part numbers. **Always monospace, no exceptions.**

**Signature element — the "data plate."** `src/components/DataPlate.tsx`: a reusable panel styled like a machine rating plate — bordered panel, corner rivet dots, condensed uppercase labels, mono values. Used for equipment page headers and wizard confirmations. This is the one decorative flourish; everything else stays quiet and disciplined.

**Accessibility / mobile rules:**
- Touch targets ≥ 48px
- Visible keyboard focus states on everything interactive
- Respect `prefers-reduced-motion`

---

## DATA MODEL (Prisma — see `prisma/schema.prisma`)

- **Equipment**: name, manufacturer, model, serial, location, installDate, photoUrl, warrantyExpires, notes
- **SpecField**: flexible label/value pairs per equipment (voltage, refrigerant, filter size, whatever)
- **ManualFile**: title + fileUrl per equipment
- **Part**: name, partNumber, price (nullable), photoUrl (nullable), vendorUrl (nullable — preferred vendor's product/order page), per equipment
- **Tech**: name, email, phone
- **ServiceRequest**: requestNumber (int, unique, sequential — **displayed as `SR-0001`**, format with `formatRequestNumber()` in `src/lib/format.ts`), equipment, requesterName, description, photoUrl, urgency (`LOW|NORMAL|URGENT`), status (`OPEN|ASSIGNED|IN_PROGRESS|COMPLETED`), tech (nullable), internalNotes, createdAt, completedAt
- **ServiceRecord**: work history per equipment; optionally linked to the ServiceRequest that spawned it
- **PartOrder** + **PartOrderLine**: a requested order of parts (qty per part) for one equipment; orderNumber (int, unique, sequential — displayed as `PO-0001` via `formatOrderNumber()`)
- **RequestEvent**: per-request timeline + notes; kind (`STATUS|NOTE`), text, createdAt. STATUS rows are written by assign/start/complete actions; NOTE rows are the append-only internal notes. (The older `ServiceRequest.internalNotes` string field is unused — notes live here.)
- **Tag**: code (8-char unique URL-safe string), role (`UNASSIGNED|EQUIPMENT|SERVICE_REQUEST`), equipmentId (nullable), label (e.g. "Front kitchen wall"), batch, assignedAt, voided
- **TagBatch**: batchNumber, count — tags are printed in batches, assigned later
- **Setting**: key/value store (`adminEmail`, `dashboardPin`, `restaurantName`, `restaurantAddress`)

SQLite has no native enums — enum-like fields are strings validated in app code (constants in `src/lib/constants.ts`).

---

## PROJECT STATUS

- [x] Scaffold, schema, design tokens, DataPlate component, seed data
- [x] Equipment detail page (`/equipment/[id]`): DataPlate header w/ photo + warranty status, tabs, manuals w/ file sizes, parts counter + order flow (PO emails admin), service history
- [x] Equipment index (`/equipment`) with search
- [x] Service request flow (`/request`, `?equipment=` pre-select, photo upload, SR-#### confirmation)
- [x] PIN-protected dashboard: PIN pad + HMAC session, queue (stats/filters/search/pulse), request detail (assign→email, status flow→ServiceRecord, timeline, notes), admin (equipment/techs/settings CRUD)
- [x] Tag system: `/t/[code]` routing, PIN-gated setup wizard, batch generator + printable QR sticker sheets, tag table (void/restore/reassign)
- [x] Polish pass: 390/1280 sweep (no overflow, targets ≥48px), queue skeleton, consistent empty states, reduced-motion-safe animations

- [x] Deploy prep: Vercel Blob uploads (token-gated w/ local fallback), Postgres/Neon datasource + pg adapter, BASE_URL env, `/test-plate` removed, home page finalized, production build passing

**DEPLOY STATE:** live on Vercel (project `trifecta-group/trifecta-asset-tracker`). Neon Postgres migrated and seeded; Blob store is `trifecta-public-store` (must be **Public** access — Private stores reject `access: 'public'` uploads and can't be switched after creation, learned the hard way). All 4 env vars set in Vercel: DATABASE_URL, BLOB_READ_WRITE_TOKEN, RESEND_API_KEY, BASE_URL.

**Important:** local `.env`'s `DATABASE_URL` now points at the SAME production Neon database (there's no separate dev DB). Running `npm run dev` locally reads/writes real production data. `BLOB_READ_WRITE_TOKEN` is commented out locally on purpose, so local dev photo/PDF uploads fall back to `/public/uploads` instead of landing in the production Blob store — uncomment only for one-off tasks (like re-seeding) that intentionally need to write to prod Blob, then comment it back out. If ongoing local feature testing resumes, consider a separate Neon branch database for dev.

**Verified live (post-deploy):** PIN gate (wrong PIN shakes/clears, correct unlocks), tag wizard end-to-end (unassigned scan → PIN → wizard → assigned → scan-again routes correctly), photo upload survives on the public Blob store (fetched the uploaded URL directly, HTTP 200). Dashboard PIN was changed by Parker post-deploy via Admin (no longer 417293 — check with him or use "forgot PIN" reasoning if locked out, there's no recovery flow yet). Real email delivery to a live tech inbox is the one check still outstanding.

**Global home link:** every page (equipment index/detail, request form, tag wizard, PIN gate, inactive-tag page) has a small home-icon + wordmark header (`src/components/AppHeader.tsx`) linking to `/`. The dashboard's own Queue/Tags/Admin/Lock nav (`src/app/dashboard/layout.tsx`) got the same home icon inline instead of a stacked second header. Print sheets deliberately don't get it (print:hidden chrome only).

**Tech delete now reopens orphaned requests:** the Tech→ServiceRequest FK is `onDelete: SetNull`, which only clears `techId` — it doesn't touch `status`, so deleting an assigned tech used to leave requests stuck showing ASSIGNED with no tech (found live: Parker deleted the seed techs and added himself, orphaning SR-0001). `saveTechRow`'s delete branch (`src/app/dashboard/admin/actions.ts`) now reverts any ASSIGNED/IN_PROGRESS requests for that tech back to OPEN and logs it in the timeline, in the same transaction as the delete.

Real equipment data (from `Trifecta/data tags/` nameplate photos) replaces the demo seed whenever Parker's ready for that.

**Admin: manuals-from-URL, part vendor links, and a real UI bug found by both.** `addManual` and `savePartRow` (`src/app/dashboard/admin/actions.ts`) both accept a plain-text URL via `normalizeUrl()` (prepends `https://` if the scheme was left off, then validates with the `URL` constructor) — manuals can be linked instead of uploaded, and each part can carry a `vendorUrl` shown as a "View at vendor ↗" link. **Important:** the URL fields in the admin editor (`src/app/dashboard/admin/equipment/[id]/page.tsx`) must stay `type="text"`, not `type="url"` — native `type="url"` validation silently blocks form submission (no error, just a browser tooltip) on any value without a scheme, which defeats `normalizeUrl()`'s whole purpose before the request ever reaches the server. All part-row and add-a-part fields (Part Name, Part #, Price, Vendor Link, Photo) now have persistent visible labels, not just placeholders — placeholders disappear once a value is filled in, which was confusing on existing rows.
