import { jsPDF } from "jspdf";
import { formatNaira } from "./estimate";
import type { EstimateInput, EstimateResult } from "./estimate";
import { STAGES, SUBTYPES } from "./data";

function subtypeLabel(input: EstimateInput): string {
  const list = SUBTYPES[input.buildingType] ?? [];
  return list.find((s) => s.value === input.subtype)?.label ?? input.subtype;
}

export interface PdfBranding {
  companyName?: string;
  companyPhone?: string;
  pricesAsOf?: string | null;
  watermark?: boolean;
}

function stampWatermark(doc: jsPDF) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setTextColor(210, 210, 210);
    doc.setFontSize(46);
    doc.setFont("helvetica", "bold");
    doc.text("FREE PLAN — naija-build-estimator.pages.dev", pageW / 2, pageH / 2, {
      align: "center",
      angle: 35,
    });
  }
}

export function exportEstimatePdf(
  input: EstimateInput,
  result: EstimateResult,
  projectName: string,
  branding: PdfBranding = {},
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  doc.setFillColor(109, 40, 217);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(branding.companyName || "Naija Build Estimator", margin, 34);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(
    branding.companyPhone
      ? `Bill of Quantities — Cost Estimate · ${branding.companyPhone}`
      : "Bill of Quantities — Cost Estimate",
    margin,
    54,
  );
  y = 100;

  doc.setTextColor(20, 20, 20);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(projectName || "Untitled Project", margin, y);
  y += 20;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const stageLabels = input.stages.includes("full")
    ? "Full Completion"
    : input.stages.map((k) => STAGES.find((s) => s.key === k)?.label ?? k).join(", ");
  const meta = [
    `Building: ${input.buildingType} — ${subtypeLabel(input)}`,
    `Floor area: ${input.floorArea} m² · Storeys: ${input.storeys} · Built: ${result.quantities.totalBuiltArea} m²`,
    `Location: ${input.state}`,
    `Stages: ${stageLabels}`,
    `Generated: ${new Date().toLocaleDateString("en-NG")}`,
    ...(branding.pricesAsOf
      ? [`Market prices as of: ${new Date(branding.pricesAsOf).toLocaleDateString("en-NG")}`]
      : []),
  ];
  meta.forEach((line) => {
    doc.text(line, margin, y);
    y += 15;
  });
  y += 6;

  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  // Total
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Total Project Estimate", margin, y);
  doc.setTextColor(109, 40, 217);
  doc.setFontSize(16);
  doc.text(formatNaira(result.grandTotal), pageW - margin, y, { align: "right" });
  y += 18;
  if (result.contingency > 0) {
    doc.setTextColor(90, 90, 90);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Includes ${formatNaira(result.contingency)} contingency (${input.contingencyPct}%) on works of ${formatNaira(result.total)}`,
      pageW - margin,
      y,
      { align: "right" },
    );
    y += 14;
  }
  y += 10;

  // Trade table
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Trade", margin, y);
  doc.text("Material", pageW - margin - 200, y, { align: "right" });
  doc.text("Labour", pageW - margin - 100, y, { align: "right" });
  doc.text("Total", pageW - margin, y, { align: "right" });
  y += 8;
  doc.line(margin, y, pageW - margin, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  result.trades.forEach((t) => {
    if (y > 760) {
      doc.addPage();
      y = margin;
    }
    doc.text(t.label, margin, y);
    doc.text(formatNaira(t.material), pageW - margin - 200, y, { align: "right" });
    doc.text(formatNaira(t.labour), pageW - margin - 100, y, { align: "right" });
    doc.text(formatNaira(t.total), pageW - margin, y, { align: "right" });
    y += 16;
  });

  y += 8;
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  // Quantities
  doc.setFont("helvetica", "bold");
  doc.text("Key Material Quantities", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  const q = result.quantities;
  const qty = [
    `Cement: ${q.cementBags.toLocaleString()} bags`,
    `Steel: ${q.steelTonnes} tonnes`,
    `Sand: ${q.sandTrips} trips`,
    `Granite: ${q.graniteTrips} trips`,
    `Blocks: ${q.blocks.toLocaleString()} units`,
    `Roof area: ${q.roofAreaM2.toLocaleString()} m²`,
  ];
  qty.forEach((line) => {
    doc.text(line, margin, y);
    y += 15;
  });

  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "Estimate is an approximation for preliminary budgeting only. Verify quantities and unit prices with local suppliers and a quantity surveyor.",
    margin,
    y,
    { maxWidth: pageW - margin * 2 },
  );

  if (branding.watermark) stampWatermark(doc);

  const filename = `${(projectName || "estimate").replace(/[^a-z0-9]+/gi, "_")}.pdf`;
  doc.save(filename);
}
