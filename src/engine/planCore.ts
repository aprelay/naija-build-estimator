// Environment-agnostic floor-plan analysis: works in the browser (pdfjs-dist)
// and in Cloudflare Pages Functions (unpdf), given a pdfjs-style document proxy.

export interface PlanExtraction {
  areaSqm: number | null;
  lengthM: number | null;
  widthM: number | null;
  hasPool: boolean;
  /** Distinct floor levels found on the drawing (ground floor counts as 1). */
  floors: number | null;
}

const num = (s: string) => parseFloat(s.replace(/,/g, ""));
const SQFT_TO_SQM = 0.09290304;
const FT_TO_M = 0.3048;

export interface PosItem {
  v: number; // metres
  x: number;
  y: number;
  page: number;
}

export interface PlanBuckets {
  text: string;
  numItems: PosItem[]; // metre-scale dimension figures
  mmItems: PosItem[]; // millimetre dimension / grid-bay figures
  ftItems: PosItem[]; // feet-inch dimension figures
}

// Minimal structural types for a pdfjs document proxy (browser or serverless build).
interface TextItemLike {
  str?: string;
  transform?: number[];
}
interface PageLike {
  view: number[];
  getTextContent(): Promise<{ items: TextItemLike[] }>;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
}
export interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<PageLike>;
}

// Numbers aligned in a row sum to a width, in a column to a depth; clusters
// split on large positional gaps (side-by-side floor plans on one sheet).
function chainSums(items: PosItem[], key: "x" | "y", other: "x" | "y"): number[] {
  const groups = new Map<string, PosItem[]>();
  for (const it of items) {
    const gk = `${it.page}:${Math.round(it[key] / 6)}`;
    (groups.get(gk) ?? groups.set(gk, []).get(gk)!).push(it);
  }
  const sums: number[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a[other] - b[other]);
    const gaps = g.slice(1).map((it, i) => it[other] - g[i][other]);
    const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    let cluster: number[] = [g[0].v];
    for (let i = 1; i < g.length; i++) {
      if (gaps[i - 1] > Math.max(2.5 * median, 150)) {
        if (cluster.length >= 2) sums.push(cluster.reduce((s, v) => s + v, 0));
        cluster = [];
      }
      cluster.push(g[i].v);
    }
    if (cluster.length >= 2) sums.push(cluster.reduce((s, v) => s + v, 0));
  }
  return sums.filter((s) => s >= 4 && s <= 60);
}

function envelopeArea(items: PosItem[], floors: number): number | null {
  const widths = chainSums(items, "y", "x");
  const depths = chainSums(items, "x", "y");
  if (!widths.length || !depths.length) return null;
  const perFloor = Math.max(...widths) * Math.max(...depths);
  return perFloor >= 20 && perFloor <= 2000 ? Math.round(perFloor * floors) : null;
}

/** Reads text + positioned dimension figures from up to 20 pages of a PDF. */
export async function collectPdfBuckets(doc: PdfDocLike): Promise<PlanBuckets> {
  const buckets: PlanBuckets = { text: "", numItems: [], mmItems: [], ftItems: [] };
  const pages = Math.min(doc.numPages, 20);
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    buckets.text += content.items.map((it) => it.str ?? "").join(" ") + "\n";
    for (const it of content.items) {
      if (typeof it.str !== "string" || !it.transform) continue;
      const s = it.str.trim();
      const pos = { x: it.transform[4], y: it.transform[5], page: i };
      if (/^\d{1,2}(?:\.\d{1,2})?$/.test(s)) {
        const v = parseFloat(s);
        if (v >= 0.5 && v <= 20) buckets.numItems.push({ v, ...pos });
      } else if (/^\d{3,5}$/.test(s)) {
        const v = parseInt(s, 10) / 1000;
        if (v >= 0.5 && v <= 20) buckets.mmItems.push({ v, ...pos });
      } else {
        const ft = s.match(/^(\d{1,3})'(?:-?(\d{1,2})(?:\s*\d\/\d)?")?$/);
        if (ft) {
          const v = (+ft[1] + (+(ft[2] ?? 0)) / 12) * FT_TO_M;
          if (v >= 0.5 && v <= 30) buckets.ftItems.push({ v, ...pos });
        }
      }
    }
  }
  return buckets;
}

/** Text/position analysis (all detection patterns except the vector fallback). */
export function analyzePlan(buckets: PlanBuckets): PlanExtraction {
  const { numItems, mmItems, ftItems } = buckets;
  // CAD exports often emit the ² superscript as a separate glyph: "33.458 m 2"
  const text = buckets.text.replace(/m\s*(?:²|2)(?![\d.])/gi, "m2");

  const hasPool = /swimming\s*pool|\bpool\b/i.test(text);

  // Distinct floor-plan labels, e.g. "GROUND FLOOR PLAN", "FIRST FLOOR PLAN".
  const floorLabels = new Set(
    (text.match(/\b(?:ground|first|second|third|fourth|fifth|typical|upper|lower)\s+floor\s+plan/gi) ?? []).map((s) =>
      s.toLowerCase().replace(/\s+/g, " "),
    ),
  );
  let floors: number | null = floorLabels.size || null;

  // Imperial totals, e.g. "TOTAL: 2,043 sq. ft" (Matterport) or "TOTAL 2302 SF"
  const FT_UNIT = String.raw`(?:sq\.?\s*\.?\s*ft|sqft|ft²|square f|s\.?f\.?\b)`;
  const sqftMatch =
    text.match(new RegExp(String.raw`total[^0-9]{0,20}([\d,]{2,9}(?:\.\d{1,2})?)\s*${FT_UNIT}`, "i")) ??
    text.match(new RegExp(String.raw`(?:gross|floor|building)\s*area[^0-9]{0,20}([\d,]{2,9}(?:\.\d{1,2})?)\s*${FT_UNIT}`, "i")) ??
    text.match(new RegExp(String.raw`([\d,]{2,9}(?:\.\d{1,2})?)\s*${FT_UNIT}`, "i"));
  if (sqftMatch) {
    const areaSqm = Math.round(num(sqftMatch[1]) * SQFT_TO_SQM);
    if (areaSqm >= 10 && areaSqm <= 100000) return { areaSqm, lengthM: null, widthM: null, hasPool, floors };
  }

  // e.g. "TOTAL AREA: 250 sqm", "Floor area 250.5 m2", "GFA 300m²", plus
  // title-block fields: "BUILT-UP AREA", "B.U.A. 250", "PLINTH AREA", "CARPET AREA"
  const areaMatch =
    text.match(
      /(?:total|floor|plan|gross|built[- ]?up|plinth|carpet|site)?\s*area[^0-9]{0,12}([\d,]{2,7}(?:\.\d{1,3})?)\s*(?:sq\.?\s*m|sqm|m²|m2|square met)/i,
    ) ??
    text.match(/\bB\.?U\.?A\.?[^0-9a-z]{0,8}([\d,]{2,7}(?:\.\d{1,3})?)\s*(?:sq\.?\s*m|sqm|m2)?\b/i) ??
    text.match(/\bG\.?F\.?A\.?[^0-9a-z]{0,8}([\d,]{2,7}(?:\.\d{1,3})?)\s*(?:sq\.?\s*m|sqm|m2)?\b/i);

  // e.g. "20m x 15m", "20.5 × 15"
  const dimMatch = text.match(
    /(\d{1,3}(?:\.\d{1,2})?)\s*m?\s*[x×]\s*(\d{1,3}(?:\.\d{1,2})?)\s*m\b/i,
  );

  let areaSqm = areaMatch ? num(areaMatch[1]) : null;
  const lengthM = dimMatch ? num(dimMatch[1]) : null;
  const widthM = dimMatch ? num(dimMatch[2]) : null;

  // No labelled total — use the area stamps on the drawing: a single stamp is the
  // floor area; multiple stamps (per floor or per room) are summed.
  if (!areaSqm) {
    const stamps = (text.match(/(?<![\d.,])\d{1,4}(?:\.\d{1,3})?\s*(?:m2|sqm)\b/gi) ?? [])
      .map((r) => parseFloat(r))
      .filter((v) => v >= 1 && v <= 2000);
    if (stamps.length === 1 && stamps[0] >= 10) areaSqm = Math.round(stamps[0]);
    else if (stamps.length >= 2) areaSqm = Math.round(stamps.reduce((s, v) => s + v, 0));
  }
  if (!areaSqm && lengthM && widthM) areaSqm = Math.round(lengthM * widthM);

  // Metric CAD drawings with dimension chains in millimetres and no stated area:
  // the overall building dimensions are the large mm values repeated on the
  // drawing (once per axis end). Take the two largest repeated values as
  // length × width, and multiply by the number of distinct floor plans shown.
  if (!areaSqm && /floor\s*plan/i.test(text)) {
    const counts = new Map<number, number>();
    for (const m of text.match(/(?<![\d.,])\d{4,5}(?![\d.,])/g) ?? []) {
      const v = parseInt(m, 10);
      if (v >= 4000 && v <= 80000) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const dims = [...counts.entries()]
      .filter(([, c]) => c >= 2)
      .map(([v]) => v)
      .sort((a, b) => b - a)
      .slice(0, 2);
    if (dims.length === 2) {
      const [l, w] = dims.map((v) => v / 1000);
      const perFloor = l * w;
      if (perFloor >= 20 && perFloor <= 2000) {
        areaSqm = Math.round(perFloor * (floors ?? 1));
      }
    }
  }
  // Dimension chains along the drawing edges with no stated area: reconstruct
  // the footprint from the positions of the dimension figures. Works for
  // metre chains (4.5 2.2 4.8), millimetre / grid-bay chains (4500 2200…),
  // and feet-inch chains (12'-6" 10'-0"…).
  if (!areaSqm && /floor\s*plan/i.test(text)) {
    for (const items of [numItems, mmItems, ftItems]) {
      if (items.length < 4) continue;
      const a = envelopeArea(items, floors ?? 1);
      if (a) {
        areaSqm = a;
        break;
      }
    }
  }

  // Imperial drawings with only per-room dimensions (11'-6" X 17'-3") and no
  // stated area: sum the room areas per page. Pages whose totals are within 3%
  // of an earlier page are alternative options of the same floor — count once.
  if (!areaSqm) {
    const dimRe = /(\d{1,2})'(?:-(\d{1,2})\s*(?:\d\/\d)?")?\s*[xX×]\s*(\d{1,2})'(?:-(\d{1,2})\s*(?:\d\/\d)?")?/g;
    const kept: number[] = [];
    for (const pageText of text.split("\n")) {
      let m: RegExpExecArray | null;
      let sum = 0;
      dimRe.lastIndex = 0;
      while ((m = dimRe.exec(pageText))) {
        const a = +m[1] + (+(m[2] ?? 0)) / 12;
        const b = +m[3] + (+(m[4] ?? 0)) / 12;
        const sq = a * b * SQFT_TO_SQM;
        if (sq > 0.5 && sq < 500) sum += sq;
      }
      if (sum >= 10 && !kept.some((k) => Math.abs(k - sum) / k < 0.03)) kept.push(sum);
    }
    if (kept.length) {
      areaSqm = Math.round(kept.reduce((s, v) => s + v, 0));
      floors = Math.max(floors ?? 0, kept.length);
    }
  }

  // Site plans stating plot dims and setbacks only: building envelope = plot
  // minus setbacks on each side.
  if (!areaSqm && lengthM && widthM) {
    const setbacks = [...text.matchAll(/set\s*-?backs?[^0-9]{0,15}(\d{1,2}(?:\.\d{1,2})?)\s*m/gi)].map((m) => parseFloat(m[1]));
    if (setbacks.length) {
      const s = setbacks.reduce((a, b) => a + b, 0) / setbacks.length;
      const a = Math.round((lengthM - 2 * s) * (widthM - 2 * s));
      if (a >= 20) areaSqm = a;
    }
  }

  // Prose descriptions, e.g. "…BUNGALOW ON 450 sqm PLOT" — plot size as a
  // last-resort stand-in for the footprint (flagged for user review).
  if (!areaSqm) {
    const prose = text.match(/([\d,]{2,7}(?:\.\d{1,2})?)\s*(?:sqm|m2|sq\.?\s*m)\s*(?:plot|site|land|lot)/i);
    if (prose) areaSqm = Math.round(num(prose[1]));
  }

  if (areaSqm && (areaSqm < 10 || areaSqm > 100000)) areaSqm = null;
  return { areaSqm, lengthM, widthM, hasPool, floors };
}

/** Vector fallback: no readable dimensions at all, but a stated drawing scale
 * — measure the drawn geometry itself. Uses the bounding box of the page's
 * vector paths (ignoring near-page-size frames) scaled by 1:N. */
export async function vectorFallbackArea(
  doc: PdfDocLike,
  constructPathOp: number,
  text: string,
  floors: number | null,
): Promise<number | null> {
  const scaleMatch = text.match(/scale\s*[^0-9]{0,6}1\s*:\s*(\d{2,4})/i);
  if (!scaleMatch) return null;
  const scaleN = parseInt(scaleMatch[1], 10);
  try {
    const page = await doc.getPage(1);
    const view = page.view; // [x0, y0, x1, y1] in pdf units
    const pw = view[2] - view[0];
    const ph = view[3] - view[1];
    const ops = await page.getOperatorList();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] !== constructPathOp) continue;
      const arg = ops.argsArray[i] as unknown[];
      const minMax = arg[2] as number[] | undefined;
      if (!minMax || minMax.length < 4 || !isFinite(minMax[0])) continue;
      const [x0, y0, x1, y1] = minMax;
      // Skip near-page-size boxes (sheet frames / title-block borders).
      if (x1 - x0 > 0.85 * pw && y1 - y0 > 0.85 * ph) continue;
      minX = Math.min(minX, x0); minY = Math.min(minY, y0);
      maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1);
    }
    if (isFinite(minX)) {
      const toM = (u: number) => (u / 72) * 0.0254 * scaleN;
      const w = toM(maxX - minX);
      const h = toM(maxY - minY);
      const perFloor = w * h;
      if (perFloor >= 20 && perFloor <= 5000) return Math.round(perFloor * (floors ?? 1));
    }
  } catch {
    // vector inspection is best-effort
  }
  return null;
}

/** Full extraction from an already-open PDF document proxy. */
export async function extractPlanFromDoc(doc: PdfDocLike, constructPathOp: number): Promise<PlanExtraction> {
  const buckets = await collectPdfBuckets(doc);
  const result = analyzePlan(buckets);
  if (!result.areaSqm) {
    result.areaSqm = await vectorFallbackArea(doc, constructPathOp, buckets.text, result.floors);
    if (result.areaSqm && (result.areaSqm < 10 || result.areaSqm > 100000)) result.areaSqm = null;
  }
  return result;
}
