// Developer-editable admin settings (persisted locally, like Odin's admin panel).
import { LABOUR_RATES } from "./data";
import type { LabourRates } from "./data";

export interface GradeRates {
  label: string;
  cementBags: number; // per 100 m3 concrete
  graniteT: number; // tonnes per 100 m3
  sandM3: number; // m3 per 100 m3
  waterL: number; // litres per 100 m3
}

export type GradeKey = "grade20" | "grade25" | "grade30" | "grade35";

export interface ExcavationSettings {
  method: "manual" | "machinery";
  manualPerPartition: number;
  machineryPerPartition: number;
  columnBaseFee: number;
  compactionWaterPer1000L: number;
  stateOverrides: Record<string, { manual?: number; machinery?: number; columnBase?: number }>;
}

export interface TankStandPrices {
  hChannel6: number;
  hChannel9: number;
  basePlate: number;
  foundationBolt: number;
  rod12mm: number;
  hChannel4: number;
  angleIron3: number;
  angleIron5: number;
  flatSheet18g: number;
  ironMesh: number;
  paint: number;
  labourPct: number; // % of materials
}

export interface RoofingPrices {
  gauges: Record<string, number>; // gauge label -> ₦/m2
  tiles: number; // ₦/m2
  nails: number; // ₦/m2
  sealant: number; // ₦/m2
}

export interface AdminSettings {
  pin: string;
  grades: Record<GradeKey, GradeRates>;
  stageGrades: Record<string, GradeKey>; // estimate stage key -> grade
  excavation: ExcavationSettings;
  tank: TankStandPrices;
  roofing: RoofingPrices;
  labour: LabourRates;
  hiddenTrades: string[];
  activationCodes: string[];
}

export const DEFAULT_ADMIN: AdminSettings = {
  pin: "1234",
  grades: {
    grade20: { label: "Grade 20 (1:2:4) — General structural / foundations", cementBags: 500, graniteT: 18, sandM3: 9, waterL: 3600 },
    grade25: { label: "Grade 25 (1:1.5:3) — Columns, beams, suspended slabs", cementBags: 500, graniteT: 67, sandM3: 33, waterL: 15000 },
    grade30: { label: "Grade 30 (1:1:2) — High-rise structural elements", cementBags: 500, graniteT: 44, sandM3: 22, waterL: 12000 },
    grade35: { label: "Grade 35 (1:1:1.5) — Heavy-duty columns & commercial high-rise", cementBags: 600, graniteT: 40, sandM3: 26, waterL: 14000 },
  },
  stageGrades: {
    foundation: "grade20",
    superstructure: "grade25",
    plastering: "grade25",
    mep: "grade25",
    finishes: "grade25",
    full: "grade25",
  },
  excavation: {
    method: "manual",
    manualPerPartition: 10000,
    machineryPerPartition: 25000,
    columnBaseFee: 7000,
    compactionWaterPer1000L: 1500,
    stateOverrides: {},
  },
  tank: {
    hChannel6: 180000,
    hChannel9: 230000,
    basePlate: 15000,
    foundationBolt: 10000,
    rod12mm: 12000,
    hChannel4: 30000,
    angleIron3: 19000,
    angleIron5: 29000,
    flatSheet18g: 36000,
    ironMesh: 150000,
    paint: 17000,
    labourPct: 25,
  },
  roofing: {
    gauges: {
      "0.35mm": 2500,
      "0.40mm": 3000,
      "0.45mm": 3500,
      "0.50mm": 4500,
      "0.55mm": 5500,
      "0.60mm": 6500,
      "0.70mm": 8000,
      "0.75mm": 9500,
    },
    tiles: 7500,
    nails: 850,
    sealant: 1200,
  },
  labour: { ...LABOUR_RATES },
  hiddenTrades: [],
  activationCodes: [],
};

const ADMIN_KEY = "nbe_admin_settings";

export function loadAdminSettings(): AdminSettings {
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (!raw) return structuredClone(DEFAULT_ADMIN);
    const parsed = JSON.parse(raw) as Partial<AdminSettings>;
    return {
      ...structuredClone(DEFAULT_ADMIN),
      ...parsed,
      grades: { ...structuredClone(DEFAULT_ADMIN.grades), ...(parsed.grades ?? {}) },
      stageGrades: { ...DEFAULT_ADMIN.stageGrades, ...(parsed.stageGrades ?? {}) },
      excavation: { ...structuredClone(DEFAULT_ADMIN.excavation), ...(parsed.excavation ?? {}) },
      tank: { ...DEFAULT_ADMIN.tank, ...(parsed.tank ?? {}) },
      roofing: {
        ...structuredClone(DEFAULT_ADMIN.roofing),
        ...(parsed.roofing ?? {}),
        gauges: { ...DEFAULT_ADMIN.roofing.gauges, ...(parsed.roofing?.gauges ?? {}) },
      },
      labour: { ...DEFAULT_ADMIN.labour, ...(parsed.labour ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_ADMIN);
  }
}

export function saveAdminSettings(s: AdminSettings) {
  localStorage.setItem(ADMIN_KEY, JSON.stringify(s));
}

export function generateActivationCode(n: number): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `NBE-${String(n).padStart(3, "0")}-${rand}`;
}

// Overhead water tank stand cost (MEP add-on), from component prices.
export function tankStandCost(t: TankStandPrices, storeys: number): { material: number; labour: number } {
  const channel = storeys >= 1 ? t.hChannel9 : t.hChannel6;
  const angle = storeys >= 3 ? t.angleIron5 : t.angleIron3;
  const material =
    channel * 4 +
    t.basePlate * 4 +
    t.foundationBolt * 16 +
    t.rod12mm * 2 +
    t.hChannel4 * 10 +
    angle * 32 +
    t.flatSheet18g * 3 +
    t.paint * 2;
  const labour = Math.round(material * (t.labourPct / 100));
  return { material, labour };
}

// Excavation partition-system cost: partition = 3.5 m trench; trench = cols × 5 m + 10%.
export function excavationCost(
  ex: ExcavationSettings,
  columns: number,
  floorArea: number,
  state: string,
): { trench: number; bases: number; compactionWater: number } {
  const ov = ex.stateOverrides[state] ?? {};
  const perPartition =
    ex.method === "machinery"
      ? (ov.machinery ?? ex.machineryPerPartition)
      : (ov.manual ?? ex.manualPerPartition);
  const baseFee = ov.columnBase ?? ex.columnBaseFee;
  const trenchLen = columns * 5 * 1.1;
  const partitions = Math.ceil(trenchLen / 3.5);
  const waterUnits = Math.ceil(floorArea / 25);
  return {
    trench: partitions * perPartition,
    bases: columns * baseFee,
    compactionWater: waterUnits * ex.compactionWaterPer1000L,
  };
}
