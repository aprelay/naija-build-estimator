// Floor-plan text extraction: pulls floor area / dimensions from PDF drawings.
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

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

function svgText(svg: string): string {
  // Concatenate the inner text of each <text> element (tspans fragment words).
  const texts = svg.match(/<text[^>]*>[\s\S]*?<\/text>/g) ?? [];
  return texts.map((t) => t.replace(/<[^>]+>/g, "")).join("\n");
}

export async function extractPlan(file: File): Promise<PlanExtraction> {
  const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isSvg && !isPdf) {
    throw new Error("Only PDF or SVG floor plans can be parsed — images have no readable text. Enter details manually.");
  }
  let text = "";
  const numItems: { v: number; x: number; y: number; page: number }[] = [];
  if (isSvg) {
    text = svgText(await file.text());
  } else {
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages = Math.min(doc.numPages, 20);
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text +=
        content.items
          .map((it) => ("str" in it ? it.str : ""))
          .join(" ") + "\n";
      for (const it of content.items) {
        if ("str" in it && /^\s*\d{1,2}(?:\.\d{1,2})?\s*$/.test(it.str)) {
          const v = parseFloat(it.str);
          if (v >= 0.5 && v <= 20) numItems.push({ v, x: it.transform[4], y: it.transform[5], page: i });
        }
      }
    }
  }

  // CAD exports often emit the ² superscript as a separate glyph: "33.458 m 2"
  text = text.replace(/m\s*(?:²|2)(?![\d.])/gi, "m2");

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

  // e.g. "TOTAL AREA: 250 sqm", "Floor area 250.5 m2", "GFA 300m²"
  const areaMatch = text.match(
    /(?:total|floor|plan|gross|built|site)?\s*area[^0-9]{0,12}([\d,]{2,7}(?:\.\d{1,3})?)\s*(?:sq\.?\s*m|sqm|m²|m2|square met)/i,
  );

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
  // Metre-scale drawings with only dimension chains along the edges and no
  // stated area: reconstruct the footprint from the positions of the dimension
  // figures — numbers aligned in a row sum to the width, in a column to the
  // depth. Take the largest chain on each axis as the overall envelope.
  if (!areaSqm && numItems.length >= 4 && /floor\s*plan/i.test(text) && /scale\s*1\s*:\s*\d+\s*m/i.test(text)) {
    const chainSums = (items: typeof numItems, key: "x" | "y", other: "x" | "y") => {
      const groups = new Map<string, typeof numItems>();
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
    };
    const widths = chainSums(numItems, "y", "x");
    const depths = chainSums(numItems, "x", "y");
    if (widths.length && depths.length) {
      const perFloor = Math.max(...widths) * Math.max(...depths);
      if (perFloor >= 20 && perFloor <= 2000) areaSqm = Math.round(perFloor * (floors ?? 1));
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

  if (areaSqm && (areaSqm < 10 || areaSqm > 100000)) areaSqm = null;
  return { areaSqm, lengthM, widthM, hasPool, floors };
}
