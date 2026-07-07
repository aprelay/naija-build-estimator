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

export async function extractPlan(file: File): Promise<PlanExtraction> {
  if (file.type !== "application/pdf") {
    throw new Error("Only PDF floor plans can be parsed — images have no readable text. Enter details manually.");
  }
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  const pages = Math.min(doc.numPages, 8);
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text +=
      content.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" ") + "\n";
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
