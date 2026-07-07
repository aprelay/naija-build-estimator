import {
  BUILDING_TYPE_MULTIPLIERS,
  LABOUR_RATES,
  MATERIAL_FACTORS,
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

  const typeMult = BUILDING_TYPE_MULTIPLIERS[buildingType] ?? 1;
  const regionMult = STATE_MULTIPLIERS[state] ?? 1;
  const mult = typeMult * regionMult;

  // Stage factor: "full" overrides; otherwise sum of selected factors (capped at 1).
  let stageFactor = 1;
  if (stages.length && !stages.includes("full")) {
    stageFactor = Math.min(
      1,
      stages.reduce((s, key) => s + (STAGES.find((x) => x.key === key)?.factor ?? 0), 0),
    );
  }

  const f = MATERIAL_FACTORS;

  // Wall area estimate: perimeter * height. Approx perimeter from area (square-ish) * 4, height 3m/floor.
  const perimeter = Math.sqrt(floorArea) * 4 * 1.15;
  const wallAreaM2 = perimeter * 3 * floors * 2.2; // incl. internal partitions
  const roofAreaM2 = floorArea * 1.25; // pitch allowance

  // Quantities
  const cementBags =
    floorArea * f.cementFoundation +
    builtArea * f.cementSlab +
    wallAreaM2 * f.cementBlockwork +
    wallAreaM2 * f.cementPlaster;
  const steelTonnes =
    floorArea * f.steelFoundation +
    builtArea * f.steelSlabPerFloor +
    columns * floors * f.steelColumns;
  const sandTrips = builtArea * f.sandPerM2;
  const graniteTrips = builtArea * f.granitePerM2;
  const blocks = wallAreaM2 * f.blocksPerM2Wall;

  // Material costs
  const concreteMaterial = cementBags * prices.cement + sandTrips * prices.sand + graniteTrips * prices.granite;
  const steelMaterial = steelTonnes * prices.steel;
  const blockworkMaterial = blocks * blockPrice;
  const roofingMaterial = roofAreaM2 * prices.roofingSheet * 1.4; // sheets + fasteners + timber
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
      material: floorArea * 2500,
      labour: floorArea * 1800,
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
      labour: roofAreaM2 * l.roofing * 0.4,
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

  const total = trades.reduce((s, t) => s + t.total, 0);

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
  };
}

export const formatNaira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
