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
    const pages = Math.min(doc.numPages, 8);
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text +=
        content.items
          .map((it) => ("str" in it ? it.str : ""))
          .join(" ") + "\n";
    }
  }

  // Imperial totals, e.g. "TOTAL: 2,043 sq. ft" (Matterport exports)
  const sqftMatch =
    text.match(/total[^0-9]{0,12}([\d,]{2,9}(?:\.\d{1,2})?)\s*(?:sq\.?\s*\.?\s*ft|sqft|ft²|square f)/i) ??
    text.match(/([\d,]{2,9}(?:\.\d{1,2})?)\s*(?:sq\.?\s*\.?\s*ft|sqft|ft²)\b/i);
  if (sqftMatch) {
    const areaSqm = Math.round(num(sqftMatch[1]) * SQFT_TO_SQM);
    if (areaSqm >= 10 && areaSqm <= 100000) return { areaSqm, lengthM: null, widthM: null };
  }

  // e.g. "TOTAL AREA: 250 sqm", "Floor area 250.5 m2", "GFA 300m²"
  const areaMatch = text.match(
    /(?:total|floor|plan|gross|built|site)?\s*area[^0-9]{0,12}([\d,]{2,7}(?:\.\d{1,2})?)\s*(?:sq\.?\s*m|sqm|m²|m2|square met)/i,
  ) ?? text.match(/([\d,]{2,7}(?:\.\d{1,2})?)\s*(?:sqm|m²|m2)\b/i);

  // e.g. "20m x 15m", "20.5 × 15"
  const dimMatch = text.match(
    /(\d{1,3}(?:\.\d{1,2})?)\s*m?\s*[x×]\s*(\d{1,3}(?:\.\d{1,2})?)\s*m\b/i,
  );

  let areaSqm = areaMatch ? num(areaMatch[1]) : null;
  const lengthM = dimMatch ? num(dimMatch[1]) : null;
  const widthM = dimMatch ? num(dimMatch[2]) : null;
  if (!areaSqm && lengthM && widthM) areaSqm = Math.round(lengthM * widthM);
  if (areaSqm && (areaSqm < 10 || areaSqm > 100000)) areaSqm = null;
  return { areaSqm, lengthM, widthM };
}
