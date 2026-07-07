export type BuildingType = "residential" | "commercial";

export interface UnitPrices {
  cement: number; // per 50kg bag
  steel: number; // per tonne
  sand: number; // per trip (~ m3 equiv used below)
  granite: number; // per trip
  block: number; // per block
  roofingSheet: number; // per m2
}

export interface MaterialFactors {
  cementFoundation: number; // bags per m2 footprint
  cementBlockwork: number;
  cementPlaster: number;
  cementSlab: number;
  steelFoundation: number; // tonnes per m2
  steelSlabPerFloor: number;
  steelColumns: number;
  sandPerM2: number; // trips per m2
  granitePerM2: number; // trips per m2
  blocksPerM2Wall: number;
}

export interface LabourRates {
  foundation: number; // per m2
  concrete: number;
  blockwork: number;
  roofing: number;
  electrical: number;
  plumbing: number;
  plastering: number;
  flooring: number;
  painting: number;
  carpentry: number;
  external: number;
}

// Default Nigerian market rates (₦). Editable in-app.
export const DEFAULT_PRICES: UnitPrices = {
  cement: 12500,
  steel: 1050000,
  sand: 52000,
  granite: 35000,
  block: 750,
  roofingSheet: 3500,
};

export const MATERIAL_FACTORS: MaterialFactors = {
  cementFoundation: 0.85,
  cementBlockwork: 0.12,
  cementPlaster: 0.3,
  cementSlab: 0.4,
  steelFoundation: 0.012,
  steelSlabPerFloor: 0.008,
  steelColumns: 0.06,
  sandPerM2: 0.05,
  granitePerM2: 0.08,
  blocksPerM2Wall: 9.84,
};

export const LABOUR_RATES: LabourRates = {
  foundation: 4800,
  concrete: 2600,
  blockwork: 3900,
  roofing: 3400,
  electrical: 2900,
  plumbing: 2500,
  plastering: 1900,
  flooring: 2300,
  painting: 1700,
  carpentry: 3600,
  external: 1600,
};

// Lump material/service rates per m2 by building class (₦)
export const SERVICE_RATES = {
  residential: { electrical: 9500, plumbing: 7200, finishing: 19500 },
  commercial: { electrical: 14500, plumbing: 10500, finishing: 28000 },
} as const;

export const BUILDING_TYPE_MULTIPLIERS: Record<BuildingType, number> = {
  residential: 1,
  commercial: 1.35,
};

export const SUBTYPES: Record<BuildingType, { value: string; label: string; storeys: number }[]> = {
  residential: [
    { value: "bungalow", label: "Bungalow", storeys: 0 },
    { value: "single_storey", label: "Single Storey (detached)", storeys: 1 },
    { value: "duplex", label: "Duplex / Semi-detached", storeys: 2 },
    { value: "flat", label: "Flat / Apartment", storeys: 3 },
    { value: "terrace", label: "Terrace / Row House", storeys: 2 },
    { value: "highrise", label: "High-Rise (4+ storeys)", storeys: 5 },
  ],
  commercial: [
    { value: "office", label: "Office Building", storeys: 3 },
    { value: "retail", label: "Retail / Shopping", storeys: 1 },
    { value: "warehouse", label: "Warehouse / Industrial", storeys: 1 },
    { value: "hotel", label: "Hotel / Hospitality", storeys: 4 },
    { value: "mixeduse", label: "Mixed-Use Development", storeys: 4 },
  ],
};

// Regional cost multipliers by state (labour + logistics). Grouped by geopolitical zone.
export const STATE_MULTIPLIERS: Record<string, number> = {
  Lagos: 1.15,
  "FCT Abuja": 1.12,
  Rivers: 1.1,
  Ogun: 1.02,
  Oyo: 1.0,
  Kano: 0.95,
  Kaduna: 0.95,
  Enugu: 0.98,
  Anambra: 0.98,
  "Akwa Ibom": 1.05,
  Delta: 1.03,
  Edo: 1.0,
  Kwara: 0.96,
  Plateau: 0.94,
  Borno: 0.92,
  Sokoto: 0.92,
  "Cross River": 1.0,
  Osun: 0.98,
  Ondo: 0.98,
  Abia: 0.98,
};

export const STATES = Object.keys(STATE_MULTIPLIERS).sort();

// Construction stages with completion factor (share of a full build).
export interface Stage {
  key: string;
  label: string;
  description: string;
  factor: number; // 0..1 share of full build cost
}

export const STAGES: Stage[] = [
  {
    key: "foundation",
    label: "Foundation → Ground Floor Slab",
    description: "Site works, excavation, foundation and ground floor slab.",
    factor: 0.38,
  },
  {
    key: "superstructure",
    label: "Superstructure → Roof Level",
    description: "Walling, columns, beams, upper slabs and roof structure.",
    factor: 0.5,
  },
  {
    key: "plastering",
    label: "Plastering & Rendering",
    description: "Internal and external wall plastering.",
    factor: 0.05,
  },
  {
    key: "mep",
    label: "MEP Installation",
    description: "Mechanical, electrical and plumbing rough-in.",
    factor: 0.04,
  },
  {
    key: "finishes",
    label: "Openings & Finishes",
    description: "Doors, windows, tiling, painting and finishing.",
    factor: 0.03,
  },
  {
    key: "full",
    label: "Full Completion",
    description: "Complete building from foundation to finishes.",
    factor: 1,
  },
];

export const FX_RATES: Record<string, number> = {
  USD: 1550,
  GBP: 1950,
  EUR: 1670,
  CAD: 1130,
  AUD: 1020,
};
