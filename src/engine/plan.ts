// Floor-plan text extraction: pulls floor area / dimensions from PDF drawings.
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PlanExtraction {
  areaSqm: number | null;
  lengthM: number | null;
  widthM: number | null;
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
    }
  }

  // CAD exports often emit the ² superscript as a separate glyph: "33.458 m 2"
  text = text.replace(/m\s*(?:²|2)(?![\d.])/gi, "m2");

  // Imperial totals, e.g. "TOTAL: 2,043 sq. ft" (Matterport) or "TOTAL 2302 SF"
  const FT_UNIT = String.raw`(?:sq\.?\s*\.?\s*ft|sqft|ft²|square f|s\.?f\.?\b)`;
  const sqftMatch =
    text.match(new RegExp(String.raw`total[^0-9]{0,20}([\d,]{2,9}(?:\.\d{1,2})?)\s*${FT_UNIT}`, "i")) ??
    text.match(new RegExp(String.raw`(?:gross|floor|building)\s*area[^0-9]{0,20}([\d,]{2,9}(?:\.\d{1,2})?)\s*${FT_UNIT}`, "i")) ??
    text.match(new RegExp(String.raw`([\d,]{2,9}(?:\.\d{1,2})?)\s*${FT_UNIT}`, "i"));
  if (sqftMatch) {
    const areaSqm = Math.round(num(sqftMatch[1]) * SQFT_TO_SQM);
    if (areaSqm >= 10 && areaSqm <= 100000) return { areaSqm, lengthM: null, widthM: null };
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
  if (areaSqm && (areaSqm < 10 || areaSqm > 100000)) areaSqm = null;
  return { areaSqm, lengthM, widthM };
}
