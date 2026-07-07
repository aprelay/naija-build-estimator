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
- **Saved estimates** — history stored in localStorage; reload any past project.
- **PWA-ready** — installable, mobile-first, works fully offline after first load (no backend).

## Tech Stack

- React 18 + TypeScript + Vite
- jsPDF for PDF generation
- No backend — all data stays in the browser (localStorage)

## Development

```bash
npm install
npm run dev        # start dev server
npm run build      # typecheck + production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

## Disclaimer

Estimates are approximations for preliminary budgeting only. Default unit prices reflect typical Nigerian market rates and should be verified with local suppliers and a quantity surveyor.
