@AGENTS.md

# Trifecta Asset Tracker

Mobile-first web app for managing commercial kitchen equipment and service requests in **one restaurant**. QR tags on equipment link to equipment pages and service-request forms; a PIN-protected dashboard manages requests, techs, parts, and tags.

**Pilot site:** Waterman's Surfside Grille ("Grille" with the E, per their logo), 415 Atlantic Ave, Virginia Beach, VA 23451. Logo: `public/brand/watermans-logo-full.png` (transparent background, works on the dark theme). Other Trifecta locations will come later — until then, build single-restaurant and pull the restaurant name/address from the `Setting` table (`restaurantName`, `restaurantAddress`), never hardcode it. Note: `Equipment.location` means the spot *within* the restaurant ("Cook line — station 2"); when multi-location arrives it gets its own model, not this field.

---

## STACK (boring and reliable, on purpose)

- **Next.js (App Router) + TypeScript + Tailwind CSS**
- **Postgres (Neon) via Prisma** — `DATABASE_URL` in `.env` (Neon pooled connection string; `@prisma/adapter-pg`). The client in `src/lib/db.ts` is a lazy singleton so `next build` works without a database. The old SQLite era is preserved at `prisma/dev.db.sqlite-backup` + `prisma/migrations-sqlite-backup/` (both gitignored).
- **File storage:** `src/lib/uploads.ts` — Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set (production), `/public/uploads` local disk otherwise (dev). The seed uploads its placeholder assets to Blob when the token is present. Blob image domains are allowed in `next.config.ts`.
- **Email: Resend** for transactional mail (assignment notifications, part order requests). API key from `RESEND_API_KEY` env var. **If no key is set, log the email to the console instead of failing.** Never let missing email config break a request.
- **QR codes:** `qrcode` npm package.
- **Auth:** no auth library. Dashboard is protected by a **6-digit PIN**, checked server-side, stored in an httpOnly session cookie. PIN lives in the `Setting` table (`dashboardPin`).

## COMMANDS

- `npm run dev` — dev server
- `npx prisma migrate dev` — apply schema changes, then `npx prisma generate` and **restart the dev server** (the Prisma client singleton on `globalThis` survives hot reload and keeps the stale schema)
- `npx prisma db seed` — run seed (`prisma/seed.ts` via tsx)
- `npx prisma studio` — inspect the DB

## ROUTES

- `/` — home: logo + links to Equipment / Report a problem / Dashboard (static, no DB)
- `/equipment` — public index, `?q=` searches name/model
- `/equipment/[id]` — public detail (QR scan target): DataPlate header, sticky OVERVIEW/MANUALS/PARTS/HISTORY tabs, part-order flow (`EquipmentTabs` client component + `submitPartOrder` server action → emails admin)
- `/request` — public service-request form (one screen). `?equipment={id}` pre-selects. Photo uploads land in `/public/uploads/requests/`. No email on create (per spec — emails are for assignment + part orders)
- `/dashboard` — PIN-gated queue (stats strip, status chips, search, urgent-first sort; URGENT+OPEN+>4h badges pulse). Any dashboard page renders the PIN pad in place when there's no session
- `/dashboard/requests/[id]` — request detail: assign (emails tech, `[URGENT]` subject tag), Assigned → In Progress → Completed (completion writes a ServiceRecord), timeline + append-only notes (`RequestEvent`)
- `/dashboard/admin` — equipment list + techs CRUD + settings (admin email, PIN change). `/dashboard/admin/equipment/[id]` (or `new`) — full equipment editor (details, photo, specs, manuals, parts; delete blocked when service history exists)
- `/t/[code]` — **the only URL a QR sticker ever encodes.** Routes by tag state: voided/unknown → "isn't active" page; EQUIPMENT → equipment page; SERVICE_REQUEST → `/request?from={label}`; UNASSIGNED → PIN-gated setup wizard (`TagWizard`: equipment new/existing, or request station). Wizard actions must NOT call revalidatePath — it re-runs the route mid-action and the fresh redirect eats the confirmation screen
- `/dashboard/tags` — batch generator (default 20, max 100), tag table (role badges, points-to, void/restore, reassign→wizard), blanks filter. `/dashboard/tags/print/[batchNumber]` — printable sticker sheet: 2in × 2in, dashed cut lines, QR → `{APP_URL}/t/{code}`, mono code fallback, caption is the `restaurantName` setting + "SCAN ME" (never hardcode the restaurant), pure black on white (print: chrome is `print:hidden`)

## AUTH

No auth library. `src/lib/session.ts`: session cookie (`tat_session`, httpOnly, 12h) is `expires.HMAC(expires)` where the HMAC key is derived from the dashboard PIN — changing the PIN invalidates all sessions automatically (changePin re-issues the caller's cookie so they stay in). Server actions all start with a session assert; pages render `PinGate` in place when unauthenticated.

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
- **Part**: name, partNumber, price (nullable), photoUrl (nullable), per equipment
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

**DEPLOY STATE:** code is deploy-ready and committed; local dev is PAUSED until a Neon `DATABASE_URL` lands in `.env` (then: `npx prisma migrate dev --name init` + `npx prisma db seed`). Parker's side: push to GitHub (GitHub Desktop), create Vercel project + Neon + Blob, set env vars (DATABASE_URL, BLOB_READ_WRITE_TOKEN, RESEND_API_KEY, BASE_URL). Then verify live: sticker QRs encode prod /t/ URLs, wizard on unassigned scan, real email, PIN gate, Blob photo upload. Real equipment data (from `Trifecta/data tags/` nameplate photos) comes after deploy.
