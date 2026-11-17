# Bolove

Free tools for getting to know a Norwegian home before you buy it: sun on the balcony,
traffic noise, commute times, local housing prices, and the mortgage math. Built as a
portfolio project for [jonoba.no](https://jonoba.no).

No login, no accounts, no payments. Enter an address on the homepage and every tool that
can use it picks it up.

## Tools

| Tool | Route | What it does |
|---|---|---|
| **Solkalkulator** | `/solkalkulator` | 3D map of the building. Click your balcony wall and floor to get hours of direct sun through the year, accounting for neighbouring buildings. |
| **Kart** | `/kart` | Map of housing prices (kr/m²), sales volume and price changes by municipality and city district. |
| **Lånekalkulator** | `/lanekalkulator` | Monthly cost and repayment plan for a mortgage. |
| **Eierbrøk** | `/eierbrok` | Splits ownership share by equity when 2–4 people buy together, with a repayment plan per person. |
| **Reisetid** | `/reisetid` | Distance and travel time to the places you go (work, gym, …) by car, bike, foot or public transport. |
| **Støynivå** | `/stoynivaa` | Estimated road-traffic noise from each of the eight compass directions. |

## Data sources

All open Norwegian data, plus a couple of open routing/map services:

- **Kartverket / Geonorge**: address search and WMS map layers
- **SSB** and **Oslo kommune** statistics banks (PxWeb): housing prices
- **Statens vegvesen**: NVDB road data (traffic volume, speed limits) and the official noise-zone map
- **Entur**: public transport journey planning
- **OSRM** (routing.openstreetmap.de): car, bike and walking routes
- **MapTiler**: basemaps, 3D buildings and terrain

## Stack

Next.js 15 (App Router, TypeScript, CSS Modules), MapLibre GL and SunCalc, deployed to
Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare). There's no database.
The only server code is two stateless API routes (`/api/geocode`, `/api/noise`).

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in the MapTiler keys
npm run dev                  # http://localhost:3000
```

The map tools need a free [MapTiler](https://www.maptiler.com/) API key. See
`.env.example` for the variables.

```bash
npm test             # unit tests (vitest)
npm run lint
npm run cf:preview   # build and run as a real Cloudflare Worker locally
npm run cf:deploy    # build and deploy to Cloudflare
```

The `NEXT_PUBLIC_*` map keys are inlined at build time, so they have to be set wherever
`cf:build` or `cf:deploy` runs.
