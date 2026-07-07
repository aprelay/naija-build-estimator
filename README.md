# Naija Build Estimator

A mobile-first Nigerian construction cost estimator (Bill of Quantities generator). Enter your building specs and instantly get a live Naira estimate with a full trade-by-trade breakdown, key material quantities, and a downloadable PDF — before contractors quote you.

## Features

- **Building details form** — building type (residential/commercial), subtype, floor area, storeys, columns (auto-estimated if blank), block type, and state.
- **Construction stages** — estimate the full build or individual phases (foundation, superstructure, plastering, MEP, finishes); stage costs are summed.
- **Live total** — updates as you type, with regional cost multipliers for 20 Nigerian states and FX display (USD/GBP/EUR/CAD/AUD).
- **Trade breakdown** — material and labour costs across 10 trades (excavation, concrete, steel, blockwork, roofing, electrical, plumbing, plastering, finishes, external works).
- **Material quantities** — cement bags, steel tonnage, sand/granite trips, blocks, roof area.
- **PDF export** — one-tap Bill of Quantities PDF (jsPDF).
- **Editable unit prices** — adjust market rates to your locality; persisted on-device.
- **Published market prices** — an admin can publish updated Nigerian market prices via the Prices tab (or API); all users without local overrides pick them up automatically.
- **Saved estimates** — history stored in localStorage; reload any past project.
- **PWA-ready** — installable, mobile-first, works fully offline after first load (no backend).

## Tech Stack

- React 18 + TypeScript + Vite
- jsPDF for PDF generation
- Cloudflare Pages + Pages Functions + KV for the market-prices API; estimates and overrides stay in the browser (localStorage)

## Development

```bash
npm install
npm run dev        # start dev server
npm run build      # typecheck + production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

## Deployment & Prices API

Deployed on Cloudflare Pages: https://naija-build-estimator.pages.dev

```bash
npm run build
npx wrangler@3 pages deploy dist --project-name naija-build-estimator --branch main
```

The market-prices API lives in `functions/api/prices.ts` (Pages Function bound to the `PRICES_KV` KV namespace, with an `ADMIN_KEY` secret):

- `GET /api/prices` — returns the published prices (`{prices, updatedAt}`) that all clients load on startup.
- `PUT /api/prices` — publishes new prices for all users. Requires `Authorization: Bearer <ADMIN_KEY>` and a JSON body with all six numeric prices (`cement`, `steel`, `sand`, `granite`, `block`, `roofingSheet`). Also available via the Admin section of the Prices tab in-app.

## Disclaimer

Estimates are approximations for preliminary budgeting only. Default unit prices reflect typical Nigerian market rates and should be verified with local suppliers and a quantity surveyor.
