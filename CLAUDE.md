@AGENTS.md

# Bolove

Norwegian real estate tools website.

## Stack

- **Next.js 15** (App Router, TypeScript, plain CSS Modules — no Tailwind).
- **Deployment: Cloudflare Workers** via `@opennextjs/cloudflare` (OpenNext). Config in
  [`wrangler.toml`](wrangler.toml) and [`open-next.config.ts`](open-next.config.ts).
- **Database: Neon Postgres** via `@neondatabase/serverless` (HTTP driver — no TCP), with
  **Drizzle ORM**. Schema in [`db/schema.ts`](db/schema.ts).
- **Auth: Auth.js (NextAuth v5)** with email magic links via **Resend**, using
  `@auth/drizzle-adapter`. Config in [`auth.ts`](auth.ts).

## The Workers runtime constraint

Everything under `app/`, `middleware.ts`, `auth.ts`, and any server action ultimately runs
inside a Cloudflare Worker, not Node.js. This means:

- **No Node-only APIs.** No `fs`, no `net`/TCP sockets, no `node:child_process`, no native
  addons. `nodejs_compat` is enabled in `wrangler.toml`, which covers a good chunk of Node's
  standard library, but don't assume something works there — check the
  [OpenNext Cloudflare compatibility notes](https://opennext.js.org/cloudflare) if unsure.
- **Database access must be HTTP-based.** That's why we use `@neondatabase/serverless`'s HTTP
  driver instead of `pg`/`node-postgres` — a raw TCP driver cannot run in a Worker.
- **Env vars and secrets are per-request, not module-global.** Cloudflare bindings/vars/secrets
  are only reliably available via `getCloudflareContext({ async: true })`, and only once a
  request is actually in flight. Don't read `env.SOMETHING` at module top-level (it may run
  before any request exists) — read it lazily, inside a function that executes per-request.
  This is why [`auth.ts`](auth.ts) builds its NextAuth config inside an async factory function
  instead of as a static object, and why [`db/index.ts`](db/index.ts) exports a `getDb(url)`
  factory instead of a ready-made client.
- **Local dev mirrors this on purpose.** `initOpenNextCloudflareForDev()` in
  [`next.config.ts`](next.config.ts) makes `getCloudflareContext()` work under plain
  `next dev`, reading from `.dev.vars` (not `.env.local`) — the same file format
  `wrangler dev` uses. This catches Workers-incompatible code early instead of only at deploy
  time.

## Entitlement model

There is a **single column**, `users.access_expires_at` (a timestamp), and nothing else —
no `role`, no `plan`, no `tier`. A user has access if and only if:

```
session exists AND access_expires_at > now()
```

This is enforced in [`middleware.ts`](middleware.ts), which matches every route under the
`(paid)` route group and redirects to `/pricing` if the check fails. It's re-derived (not
cached) from the session on every request via NextAuth's `session` callback in
[`auth.ts`](auth.ts), which copies `accessExpiresAt` from the adapter's `user` record onto
`session.user`.

Right now the pricing page has a **dev-only "Gi 30 dagers tilgang" button**
([`app/(marketing)/pricing/actions.ts`](app/(marketing)/pricing/actions.ts)) that sets
`access_expires_at = now() + 30 days` directly — a stand-in for a real purchase. It's gated
on `process.env.NODE_ENV !== "production"`, so it disappears the moment the app is built for
deployment. When real payments are added (Stripe), replace that button/action with a checkout
flow whose webhook does the same `UPDATE users SET access_expires_at = ...` — the entitlement
check itself (middleware, schema) should not need to change.

Don't add a `role`/`plan` column later without a real reason (e.g. multiple paid tiers with
different feature sets). As long as it's one flat product, one expiry timestamp is the whole
model.

## Adding a new paid tool

1. Create a folder under `app/(paid)/`, e.g. `app/(paid)/verditakst/page.tsx`.
2. Add the matching pattern to `middleware.ts`'s `matcher` array (e.g.
   `"/verditakst/:path*"`).
3. That's it — no other wiring. The `(paid)` layout already renders the shared header, and
   the middleware match is the only thing that decides what's gated.

Anything public (landing content, pricing, legal pages, login) goes under `app/(marketing)/`
instead, and needs no middleware changes.

## `/kart` (map)

Ported wholesale from a standalone Vite/React app (`eiendom-gis`) — same architecture, not a
rewrite: React Context (`state/LayersProvider.tsx`, `state/HousingStatsProvider.tsx`),
an adapter-pattern data layer (`data/ssb/`, `data/cityStats/`, both client-side `fetch` +
localStorage caching via `data/cache.ts`), and MapLibre GL rendered onto a raw DOM ref. There
is no backend for this tool — SSB PxWeb, Oslo kommune's PxWeb, and Kartverket WMS are all
called directly from the browser.

Because MapLibre needs a real DOM/WebGL context and `usePrefersDark` reads `window`
synchronously (not inside an effect), this whole subtree is loaded client-only via
`next/dynamic(..., { ssr: false })` in [`app/(paid)/kart/KartLoader.tsx`](app/(paid)/kart/KartLoader.tsx)
— `page.tsx` itself stays a plain Server Component. Every component under
`app/(paid)/kart/` carries its own `"use client"` directive. Static boundary GeoJSON lives in
[`public/data/`](public/data/) (fylker, kommuner, Oslo bydeler/grunnkretser), referenced by
absolute `/data/*.geojson` URLs from `config/layers.ts`.

New paid tools normally need zero extra wiring beyond the middleware matcher (see above) — this
one is the exception in one respect: it needs its own `NEXT_PUBLIC_*` vars (below), because it
was ported from a Vite app that used `import.meta.env.VITE_*` for the same purpose.

## `/solkalkulator` (3D sun calculator)

Ported from a standalone vanilla-TS/Vite app (`balcony-sun`) as a **wrapper, not a rewrite** —
it is deliberately *not* React underneath. `app/(paid)/solkalkulator/lib/` is close to a
verbatim copy of that app's `src/`: a plain state object, direct DOM wiring, a `Scene3D` class
(MapLibre GL, 3D terrain/sky/light, building-shadow approximation) and a `ReportPanel` class
(innerHTML template strings), driven by SunCalc-based astronomy math in `lib/solar.ts`. None of
that logic was touched.

**Balcony placement is click-on-building, not a compass dial.** The original app's `CompassUI`
(a canvas-drawn compass dial in `lib/compass.ts`) has been removed — one street address can
resolve to several real buildings/walls, and the floor was already being collected on the
landing form, so letting the user click the actual wall on the actual building is both more
accurate and more direct than turning an abstract dial. Only `bearingLabel` (compass-point
formatting, e.g. "SSW") survives from `compass.ts`.

The flow: after address + floor, `Scene3D.showPlacementTarget()` renders the buildings and
highlights the **target building's floor band only** (a translucent extrusion at
`(floor-1)*3`–`floor*3`m, via a dedicated `floor-band-src`/`floor-band-layer`) so the user knows
where they can click — the floor itself is never inferred from click height, it's always the
number already entered on the landing form. A `click` listener in `Scene3D`'s constructor calls
`pickWallBearing()`, then reports the result through a caller-supplied `setOnWallClick`
callback (wired from `lib/main.ts`).

**`pickWallBearing()` does real 3D ray-casting**, and went through two broken approaches before
landing there — worth knowing if this ever needs touching again:

1. *Screen-space angle matching* (compare the click's screen-space angle from the building's
   projected centroid against each edge's projected angle): broke down because `map.project()`
   only projects at ground level, so a click near the top of a tall wall is, in screen space,
   skewed toward the far side by perspective — enough to resolve to the wrong (sometimes
   opposite) wall.
2. *`queryRenderedFeatures` against the building/wall geometry* (including a dedicated invisible
   "wall pane" layer per edge): broke down because `fill-extrusion` hit-testing in this MapLibre
   version tests each feature's flat *ground footprint*, not its actual extruded 3D shape —
   confirmed by clicking squarely on a rendered wall and getting zero results, or a completely
   unrelated building, back. This isn't a tuning problem; the API is answering a different
   question than "what does this pixel show."

The fix: cast an actual ray from the camera through the click and intersect it with each wall's
real plane (each edge's two ground corners plus one corner raised to the building's height,
handled in `intersectBuildingWalls`). Two more non-obvious pitfalls surfaced getting the ray
itself right:

- `transform.getRayDirectionFromPixel()` looks like the obvious way to get the ray direction,
  but it throws `"Not implemented."` for the default Mercator projection in this MapLibre
  version — it's only implemented for globe projection. `map.unproject(point)` sidesteps this
  entirely: it always returns the ray's exact intersection with the ground (z=0) plane, which is
  itself a known point on the same ray.
- `transform.cameraPosition` looks like the obvious way to get the ray's origin, but it's in a
  different internal coordinate convention than the public `MercatorCoordinate` space (confirmed
  empirically — its values are on the order of the world size in pixels, not `MercatorCoordinate`'s
  0..1 range). Subtracting it from a `MercatorCoordinate` silently produced a "ray direction"
  dominated by that scale mismatch, one that pointed roughly the same way regardless of the
  actual click — it took an orbit test (same click target, several camera bearings, expecting the
  picked wall to stay constant) to catch, since a same-building/plausible-looking result came back
  every time. The fix uses `transform.getCameraLngLat()` / `getCameraAltitude()` — the
  documented, public way to get the camera's real geographic position — converted through
  `MercatorCoordinate.fromLngLat` so camera and building geometry are expressed in the same
  coordinate space.

The rest of the flow: after address + floor, `Scene3D.showPlacementTarget()` renders the
buildings and highlights the **target building's floor band only** (a translucent extrusion at
`(floor-1)*3`–`floor*3`m, via a dedicated `floor-band-src`/`floor-band-layer`) so the user knows
where they can click — the floor itself is never inferred from click height, it's always the
number already entered on the landing form. The camera starts at the normal pitch-60 angle and
the user is free to rotate/tilt it (via the `NavigationControl`) to see whichever wall they want
before clicking — real ray-casting means picking stays correct at any orientation. A `click`
listener in `Scene3D`'s constructor calls `pickWallBearing()`, which reports back through a
caller-supplied `setOnWallClick` callback (wired from `lib/main.ts`); a click that misses every
wall of the target building falls back to a coarse ground-projected point-in-footprint check
(`pointInFootprint`) purely to decide whether to show the `'wrong-building'` hint. Once a wall is
picked, `Scene3D.confirmBalconyPlacement()` draws the actual balcony face/arrow and clears the
floor-band highlight.

The one deliberate structural change is `lib/main.ts`: the original was a top-level script
wired directly against the global `document` (assuming it owned the whole page). It's now
`export function init(container: HTMLElement)` / `export function destroy(container)` —
every `document.getElementById(...)` became `container.querySelector(...)`, and the HTML that
used to live in `index.html` (the landing/compass/main "screens") is injected by `init()` into
`container.innerHTML`. Nothing else about its control flow changed.

[`SolkalkulatorApp.tsx`](app/(paid)/solkalkulator/SolkalkulatorApp.tsx) is the *entire* React
surface for this tool: a `useEffect` that calls `init(container)` on mount and `destroy(container)`
on cleanup, wrapping a bare `<div>`. Like `/kart`, the real app is loaded client-only via
`next/dynamic(..., { ssr: false })` in
[`SolkalkulatorLoader.tsx`](app/(paid)/solkalkulator/SolkalkulatorLoader.tsx), since MapLibre
needs a real DOM/WebGL context.

**CSS scoping:** the original `style.css` assumed it was the only stylesheet on the page —
a universal `*` reset, unscoped `html, body` rules, an unscoped `input[type=range]` selector.
[`solkalkulator.css`](app/(paid)/solkalkulator/solkalkulator.css) is that file with every
selector prefixed under `.solkalkulator-widget` (which `init()` adds to the container), so
none of it leaks onto the rest of the site. It is **not** a CSS Module — `lib/compass.ts` and
`lib/report.ts` reference plain string class names (`'.bar-col'`, `'#hm-body'`, etc.) in their
DOM/innerHTML code, exactly as in the original, so a hashed-classname module would have
required touching that logic. `@keyframes pulse`/`spin` were renamed
(`solkalkulator-pulse`/`solkalkulator-spin`) since `@keyframes` names are global regardless of
selector scoping.

**What was deliberately left out:** the original `index.html` had an inline `<script>` that
appended a global error/unhandled-rejection overlay straight onto `document.body` — dev
tooling from the standalone app, not part of `main.ts`/`scene3d.ts`/etc, and it would have
leaked outside the scoped container with no cleanup. Not ported.

**Backend:** the original had an Express server (`server/index.ts`) that only proxied
geocoding to Nominatim. Replaced by [`app/api/geocode/route.ts`](app/api/geocode/route.ts) —
plain `fetch`/`NextRequest`/`NextResponse` (Workers-compatible, no Node APIs), calling
Kartverket's open address API (`ws.geonorge.no/adresser/v1`) instead of Nominatim, with the
response reshaped into a Nominatim-like `{ lat, lon, label }[]` contract. `lib/api.ts`'s
`searchAddresses()` (originally a single-result `geocodeAddress()`) returns every match, since
one address string can hit several real locations (e.g. the same street name/number in
different towns) — the landing form shows them in a dropdown and the user must pick one before
proceeding, rather than silently taking the first result.

**`maplibre-gl` is pinned to `^5.24.0`, not `^6.0.0`.** `/kart` and `/solkalkulator` share one
copy of this dependency (npm only resolves one version per package). `balcony-sun`'s own
`package.json` specified `^6.0.0`, but MapLibre GL **v6.0.0 has a real regression**: it never
issues vector-tile (`.pbf`) requests for a style with a large vector source (confirmed via
network trace — style/sprite/TileJSON all load, but zero tile requests ever fire, so
`map.on('load')` never resolves and `Scene3D.loadFeaturesAt()` hangs forever on "Loading map
and building data…"). `/kart` only uses raster + GeoJSON sources, so it wasn't affected and
worked fine on v6 — `/solkalkulator` needs `querySourceFeatures()` against MapTiler's vector
`maptiler_planet` source, which is exactly the path that's broken. v5.24.0 has none of this
issue (verified: tiles, fonts, and terrain all load correctly, `load`/`idle` both fire). If
upgrading past v6.0.0 later, re-verify vector tile loading actually works before assuming a
newer patch fixed it.

**`suncalc` is pinned to `1.9.0`, not latest.** `balcony-sun`'s `package.json` specified
`^1.9.0`; during the port this got installed without pinning and resolved to `2.0.1`, which
made a **breaking change**: `getPosition()` returns `{ azimuth, altitude }` in **degrees** in
v2, vs **radians** in v1. `lib/solar.ts` was ported unchanged and does `pos.azimuth * 180 /
Math.PI` — correct for v1's radians, but on v2 that treats an already-in-degrees value as
radians, scaling it by another ~57x and wrapping it through `% 360` into effectively
pseudo-random-looking bearings (this is exactly what "the sun jumps all over the place when
the time slider moves" was — verified via a smooth, monotonic 62°→287° bearing sweep across a
day with v1.9.0 vs. an erratic non-monotonic sequence with v2.0.1, same input, same code). If
`suncalc` ever needs upgrading, either update to v2's degrees-based API **and** update
`solar.ts`'s conversion math to match, or stay pinned to the v1.x line — don't let it float.

## Environment variables / secrets

Three server-side secrets, used identically whether local or deployed:

| Name | Purpose |
|---|---|
| `NEON_DATABASE_URL` | Neon Postgres connection string (HTTP driver) |
| `AUTH_SECRET` | Auth.js session/token encryption secret |
| `RESEND_API_KEY` | Resend API key for sending magic-link emails |

- **Local (`next dev` or `wrangler dev`):** copy `.dev.vars.example` → `.dev.vars` and fill
  in. Read via `getCloudflareContext().env` at runtime.
- **drizzle-kit CLI only** (`db:generate`/`db:migrate`/`db:studio`, which run as plain Node,
  outside the Worker): copy `.env.example` → `.env.local` and set `NEON_DATABASE_URL` there
  too. `drizzle.config.ts` loads it directly.
- **Deployed:** `wrangler secret put NEON_DATABASE_URL` (and the same for `AUTH_SECRET`,
  `RESEND_API_KEY`) — never put secrets in `wrangler.toml`.

### `/kart` (map) env vars — different mechanism, don't confuse with the above

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_MAP_PROVIDER` | Basemap provider switch, currently only `"maplibre"` |
| `NEXT_PUBLIC_MAPTILER_API_KEY` | MapTiler key for `/kart`'s basemap style URL |
| `NEXT_PUBLIC_MAPTILER_KEY` | MapTiler key for `/solkalkulator`'s basemap + terrain URLs (separate var, ported name-for-name from that app's own `VITE_MAPTILER_KEY` — not consolidated with the one above) |

These are `NEXT_PUBLIC_` vars, not secrets accessed via `getCloudflareContext()` — Next.js
inlines them into the client JS bundle **at build time**, the same as any Next.js app,
completely independent of Cloudflare bindings. That means:

- **Local:** set in `.env.local` (already loaded automatically by `next dev`/`next build`) —
  see `.env.example`.
- **Deployed:** must be set wherever `npm run cf:build` / `next build` actually executes (CI
  environment, or a `.env.production` file) — `wrangler secret put` has **no effect** on
  `NEXT_PUBLIC_` vars, since nothing reads them at request time in the Worker.

## Commands

```bash
npm run dev          # next dev (getCloudflareContext works via .dev.vars)
npm run db:generate   # generate a Drizzle migration from db/schema.ts
npm run db:migrate    # apply migrations to NEON_DATABASE_URL
npm run cf:preview    # opennextjs-cloudflare build + wrangler dev (real Worker locally)
npm run cf:deploy     # opennextjs-cloudflare build + wrangler deploy
```
