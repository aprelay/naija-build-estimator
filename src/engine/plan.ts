// Floor-plan text extraction: pulls floor area / dimensions from PDF drawings.
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { analyzePlan, extractPlanFromDoc } from "./planCore";
import type { PdfDocLike, PlanExtraction } from "./planCore";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PlanExtraction } from "./planCore";

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
  if (isSvg) {
    return analyzePlan({ text: svgText(await file.text()), numItems: [], mmItems: [], ftItems: [] });
  }
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  return extractPlanFromDoc(doc as unknown as PdfDocLike, pdfjsLib.OPS.constructPath);
}
