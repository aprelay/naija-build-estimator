import {
  BUILDING_TYPE_MULTIPLIERS,
  FENCING_RATES,
  FORMWORK_TYPES,
  FOUNDATION_TYPES,
  HAULAGE_PER_TRIP,
  LABOUR_RATES,
  MATERIAL_FACTORS,
  PAYMENT_SCHEDULE,
  ROOF_TYPES,
  SCAFFOLDING_TYPES,
  SERVICE_RATES,
  STAGES,
  STATE_MULTIPLIERS,
} from "./data";
import type { BuildingType, UnitPrices } from "./data";

export interface EstimateInput {
  buildingType: BuildingType;
  subtype: string;
  floorArea: number; // m2 per floor (footprint)
  storeys: number; // 0 = bungalow (ground floor only)
  columns: number; // 0 = auto
  state: string;
  blockPrice: number;
  stages: string[]; // selected stage keys
  prices: UnitPrices;
  length?: number; // building length (m), refines perimeter
  width?: number; // building width (m)
  roofType?: string;
  foundationType?: string;
  formwork?: string;
  scaffolding?: string;
  columnHeight?: number; // m per storey
  columnWidthMm?: number;
  columnDepthMm?: number;
}

export interface EstimateResult {
  total: number;
  trades: { key: string; label: string; icon: string; material: number; labour: number; total: number }[];
  quantities: {
    cementBags: number;
    steelTonnes: number;
    sandTrips: number;
    graniteTrips: number;
    blocks: number;
    roofAreaM2: number;
    wallAreaM2: number;
    totalBuiltArea: number;
  };
  stageFactor: number;
  stageBreakdown: { key: string; label: string; cost: number }[];
  transport: { item: string; trips: number; cost: number }[];
  transportTotal: number;
  paymentSchedule: { label: string; pct: number; amount: number }[];
}

const round = (n: number) => Math.round(n);

export function autoColumns(floorArea: number): number {
  return Math.max(4, Math.ceil(floorArea / 16));
}

export function computeEstimate(input: EstimateInput): EstimateResult {
  const {
    buildingType,
    floorArea,
    storeys,
    state,
    blockPrice,
    stages,
    prices,
  } = input;

  const floors = Math.max(1, storeys + (storeys === 0 ? 1 : 0)); // bungalow counts as 1 floor
  const builtArea = floorArea * floors;
  const columns = input.columns > 0 ? input.columns : autoColumns(floorArea);
  const colHeight = input.columnHeight && input.columnHeight > 0 ? input.columnHeight : 3;
  const colW = (input.columnWidthMm && input.columnWidthMm > 0 ? input.columnWidthMm : 300) / 1000;
  const colD = (input.columnDepthMm && input.columnDepthMm > 0 ? input.columnDepthMm : 300) / 1000;

  const typeMult = BUILDING_TYPE_MULTIPLIERS[buildingType] ?? 1;
  const regionMult = STATE_MULTIPLIERS[state] ?? 1;
  const mult = typeMult * regionMult;

  const roofMult = ROOF_TYPES.find((r) => r.value === input.roofType)?.mult ?? 1;
  const foundationMult = FOUNDATION_TYPES.find((r) => r.value === input.foundationType)?.mult ?? 1;
  const formworkRate = FORMWORK_TYPES.find((r) => r.value === input.formwork)?.ratePerM2 ?? 4500;
  const scaffoldRate = SCAFFOLDING_TYPES.find((r) => r.value === input.scaffolding)?.ratePerM2 ?? 800;

  // Stage factor: "full" overrides; otherwise sum of selected factors (capped at 1).
  let stageFactor = 1;
  if (stages.length && !stages.includes("full")) {
    stageFactor = Math.min(
      1,
      stages.reduce((s, key) => s + (STAGES.find((x) => x.key === key)?.factor ?? 0), 0),
    );
  }

  const f = MATERIAL_FACTORS;

  // Wall area estimate: perimeter * height. Use length/width when given, else approx from area.
  const perimeter =
    input.length && input.width && input.length > 0 && input.width > 0
      ? 2 * (input.length + input.width) * 1.15
      : Math.sqrt(floorArea) * 4 * 1.15;
  const wallAreaM2 = perimeter * 3 * floors * 2.2; // incl. internal partitions
  const roofAreaM2 = floorArea * 1.25; // pitch allowance

  // Column concrete volume from schedule (m3)
  const columnVolumeM3 = columns * floors * colHeight * colW * colD;

  // Quantities
  const cementBags =
    floorArea * f.cementFoundation * foundationMult +
    builtArea * f.cementSlab +
    columnVolumeM3 * 6.5 +
    wallAreaM2 * f.cementBlockwork +
    wallAreaM2 * f.cementPlaster;
  const steelTonnes =
    floorArea * f.steelFoundation * foundationMult +
    builtArea * f.steelSlabPerFloor +
    columns * floors * f.steelColumns;
  const sandTrips = builtArea * f.sandPerM2;
  const graniteTrips = builtArea * f.granitePerM2;
  const blocks = wallAreaM2 * f.blocksPerM2Wall;

  // Material costs
  const concreteMaterial = cementBags * prices.cement + sandTrips * prices.sand + graniteTrips * prices.granite;
  const steelMaterial = steelTonnes * prices.steel;
  const blockworkMaterial = blocks * blockPrice;
  const roofingMaterial = roofAreaM2 * prices.roofingSheet * 1.4 * roofMult; // sheets + fasteners + timber
  const timberMaterial =
    builtArea * formworkRate * 0.35 + wallAreaM2 * scaffoldRate * (floors > 1 ? 0.5 : 0.15);
  const sr = SERVICE_RATES[buildingType];
  const electricalMaterial = builtArea * sr.electrical;
  const plumbingMaterial = builtArea * sr.plumbing;
  const finishingMaterial = builtArea * sr.finishing;

  const l = LABOUR_RATES;

  const trades = [
    {
      key: "excavation",
      label: "Excavation & Earthworks",
      icon: "🚧",
      material: floorArea * 2500 * foundationMult,
      labour: floorArea * 1800 * foundationMult,
    },
    {
      key: "concrete",
      label: "Concrete & Foundation",
      icon: "🪨",
      material: concreteMaterial,
      labour: (floorArea * l.foundation + builtArea * l.concrete),
    },
    {
      key: "steel",
      label: "Steel Reinforcement",
      icon: "🔩",
      material: steelMaterial,
      labour: steelTonnes * 85000,
    },
    {
      key: "blockwork",
      label: "Masonry / Blockwork",
      icon: "🧱",
      material: blockworkMaterial,
      labour: wallAreaM2 * (l.blockwork * 0.12),
    },
    {
      key: "roofing",
      label: "Roofing Works",
      icon: "🏠",
      material: roofingMaterial,
      labour: roofAreaM2 * l.roofing * 0.4 * roofMult,
    },
    {
      key: "timber",
      label: "Timber & Woods (Formwork, Scaffolding)",
      icon: "🪵",
      material: timberMaterial,
      labour: builtArea * l.carpentry * 0.2,
    },
    {
      key: "electrical",
      label: "Electrical Installation",
      icon: "⚡",
      material: electricalMaterial,
      labour: builtArea * l.electrical * 0.3,
    },
    {
      key: "plumbing",
      label: "Plumbing & Sanitary",
      icon: "🚰",
      material: plumbingMaterial,
      labour: builtArea * l.plumbing * 0.3,
    },
    {
      key: "plastering",
      label: "Plastering & Rendering",
      icon: "🎨",
      material: wallAreaM2 * 900,
      labour: wallAreaM2 * l.plastering * 0.25,
    },
    {
      key: "finishing",
      label: "Finishes (Tiling, Painting, Doors)",
      icon: "🪵",
      material: finishingMaterial,
      labour: builtArea * (l.flooring + l.painting + l.carpentry) * 0.15,
    },
    {
      key: "external",
      label: "External Works",
      icon: "🌳",
      material: floorArea * 3000,
      labour: floorArea * l.external * 0.5,
    },
  ].map((t) => {
    const material = round(t.material * mult * stageFactor);
    const labour = round(t.labour * mult * stageFactor);
    return { ...t, material, labour, total: material + labour };
  });

  // Fencing is an add-on stage costed from the site boundary, not prorated.
  if (stages.includes("fencing")) {
    const fenceLen = perimeter * 1.6;
    const material = round(fenceLen * FENCING_RATES.materialPerM * regionMult);
    const labour = round(fenceLen * FENCING_RATES.labourPerM * regionMult);
    trades.push({
      key: "fencing",
      label: "Fencing (Boundary Wall)",
      icon: "🧱",
      material,
      labour,
      total: material + labour,
    });
  }

  const total = trades.reduce((s, t) => s + t.total, 0);

  const fullBuildTotal =
    stageFactor > 0
      ? trades.filter((t) => t.key !== "fencing").reduce((s, t) => s + t.total, 0) / stageFactor
      : 0;
  const stageBreakdown = STAGES.filter((s) => !s.addon && s.key !== "full").map((s) => ({
    key: s.key,
    label: s.label,
    cost: round(fullBuildTotal * s.factor),
  }));

  const haulage = HAULAGE_PER_TRIP * regionMult;
  const transport = [
    { item: "Cement deliveries", trips: Math.ceil((cementBags * stageFactor) / 600) },
    { item: "Sand supply", trips: Math.ceil(sandTrips * stageFactor) },
    { item: "Granite supply", trips: Math.ceil(graniteTrips * stageFactor) },
    { item: "Block deliveries", trips: Math.ceil((blocks * stageFactor) / 500) },
    { item: "Steel & general haulage", trips: Math.max(1, Math.ceil(steelTonnes * stageFactor / 5)) },
  ].map((t) => ({ ...t, cost: round(t.trips * haulage) }));
  const transportTotal = transport.reduce((s, t) => s + t.cost, 0);

  const paymentSchedule = PAYMENT_SCHEDULE.map((p) => ({
    ...p,
    amount: round(total * p.pct),
  }));

  return {
    total,
    trades,
    quantities: {
      cementBags: Math.ceil(cementBags * stageFactor),
      steelTonnes: parseFloat((steelTonnes * stageFactor).toFixed(2)),
      sandTrips: Math.ceil(sandTrips * stageFactor),
      graniteTrips: Math.ceil(graniteTrips * stageFactor),
      blocks: Math.ceil(blocks * stageFactor),
      roofAreaM2: Math.round(roofAreaM2),
      wallAreaM2: Math.round(wallAreaM2),
      totalBuiltArea: Math.round(builtArea),
    },
    stageFactor,
    stageBreakdown,
    transport,
    transportTotal,
    paymentSchedule,
  };
}

export const formatNaira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
