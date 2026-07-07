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

export interface OptionRate {
  value: string;
  label: string;
  mult?: number;
  ratePerM2?: number;
}

export const ROOF_TYPES: OptionRate[] = [
  { value: "pitched_gable", label: "Pitched Roof (Gable)", mult: 1 },
  { value: "shed_roof", label: "Shed Roof", mult: 0.85 },
  { value: "concrete_roof", label: "Concrete Roof Slab", mult: 1.35 },
];

export const FOUNDATION_TYPES: OptionRate[] = [
  { value: "strip_pad", label: "Strip / Pad Foundation", mult: 1 },
  { value: "raft_hardcore", label: "Raft / Hardcore Foundation", mult: 1.25 },
  { value: "pile", label: "Pile Foundation", mult: 1.8 },
];

export const FORMWORK_TYPES: OptionRate[] = [
  { value: "marine_board", label: "Marine Board", ratePerM2: 4500 },
  { value: "ordinary_planks", label: "Ordinary Planks", ratePerM2: 2800 },
];

export const SCAFFOLDING_TYPES: OptionRate[] = [
  { value: "bamboo", label: "Bamboo", ratePerM2: 800 },
  { value: "metal_scaffold", label: "Metal Scaffold", ratePerM2: 1500 },
];

// Site preparation & utility add-ons (₦). Lump sums unless perM2 rates given.
export interface SiteAddon {
  key: string;
  label: string;
  icon: string;
  material: number;
  labour: number;
  materialPerM2?: number; // per m2 of footprint, added to material
  labourPerM2?: number;
  hint: string;
}

export const SITE_ADDONS: SiteAddon[] = [
  { key: "clearing", label: "Site Clearing & Levelling", icon: "🌿", material: 0, labour: 0, materialPerM2: 350, labourPerM2: 850, hint: "Bush clearing, debris removal, rough grading" },
  { key: "dewatering", label: "Dewatering (waterlogged site)", icon: "💦", material: 150000, labour: 280000, hint: "Pumping & sand filling for swampy sites (Lagos/PH lowlands)" },
  { key: "soakaway", label: "Soakaway & Septic Tank", icon: "🕳️", material: 850000, labour: 380000, hint: "Standard 2-chamber septic + soakaway pit" },
  { key: "borehole", label: "Borehole & Water Treatment", icon: "🚠", material: 1400000, labour: 450000, hint: "Drilling, casing, pump & basic treatment" },
  { key: "genset", label: "Generator Set (sized to building)", icon: "🔌", material: 0, labour: 250000, hint: "10–40 kVA diesel genset, supply & installation" },
  { key: "solar", label: "Solar + Inverter Backup", icon: "☀️", material: 3800000, labour: 420000, hint: "5kVA hybrid inverter, panels & lithium battery" },
];

// Swimming pool (reinforced concrete shell, tiling, pump & filtration), ₦
export const POOL_SIZES = [
  { value: "", label: "No swimming pool" },
  { value: "small", label: "Small (~6m × 3m)", material: 4500000, labour: 2500000 },
  { value: "medium", label: "Medium (~8m × 4m)", material: 7500000, labour: 3500000 },
  { value: "large", label: "Large (~12m × 6m)", material: 13000000, labour: 5500000 },
] as const;

// Genset supply cost scales with built area
export const gensetCost = (builtArea: number) =>
  builtArea <= 250 ? 2500000 : builtArea <= 600 ? 4500000 : 7500000;

export const BLOCK_OPTIONS = [
  { price: 620, label: "⛏️ Mould On-Site · ₦620", hint: "Cement + sand + moulding labour on site" },
  { price: 750, label: "🧱 Manual Mould · ₦750", hint: "" },
  { price: 1250, label: "🏭 Machine Vibrated · ₦1,250", hint: "" },
];

// Boundary fencing (2.4m block wall with pillars), ₦ per linear metre
export const FENCING_RATES = { materialPerM: 38000, labourPerM: 9000 };

export const HAULAGE_PER_TRIP = 45000; // ₦ per delivery trip (state-adjusted)

export const PAYMENT_SCHEDULE: { label: string; pct: number }[] = [
  { label: "Mobilization & site setup", pct: 0.3 },
  { label: "Foundation complete", pct: 0.25 },
  { label: "Superstructure & roof", pct: 0.25 },
  { label: "MEP & finishes", pct: 0.15 },
  { label: "Retention (on handover)", pct: 0.05 },
];

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

// Typical soil condition per state and the foundation type usually suited to it.
// Indicative only — a geotechnical survey should confirm the actual soil bearing capacity.
export interface SoilProfile {
  soil: string;
  foundation: string; // value from FOUNDATION_TYPES
  note: string;
}

const SWAMP: SoilProfile = {
  soil: "Swampy / waterlogged coastal soil",
  foundation: "raft_hardcore",
  note: "Coastal lowlands with high water table — raft (or pile for storeys) spreads the load; strip footings risk settlement.",
};
const FIRM: SoilProfile = {
  soil: "Firm laterite / sandy clay",
  foundation: "strip_pad",
  note: "Good bearing capacity — standard strip/pad foundation is usually adequate.",
};
const EXPANSIVE: SoilProfile = {
  soil: "Expansive clay (shrink–swell)",
  foundation: "raft_hardcore",
  note: "Clay swells in rainy season and shrinks in dry season — raft on hardcore resists differential movement.",
};

export const STATE_SOIL: Record<string, SoilProfile> = {
  Lagos: SWAMP,
  Rivers: SWAMP,
  "Akwa Ibom": SWAMP,
  Delta: SWAMP,
  "Cross River": { ...FIRM, note: "Mostly firm ground; riverine areas near Calabar may need raft — confirm with a soil test." },
  "FCT Abuja": FIRM,
  Ogun: FIRM,
  Oyo: FIRM,
  Osun: FIRM,
  Ondo: FIRM,
  Edo: FIRM,
  Kwara: FIRM,
  Kaduna: FIRM,
  Plateau: FIRM,
  Enugu: EXPANSIVE,
  Anambra: { ...EXPANSIVE, note: "Erosion-prone expansive soils in parts — raft on hardcore recommended; avoid building near gully areas." },
  Abia: EXPANSIVE,
  Kano: FIRM,
  Sokoto: FIRM,
  Borno: FIRM,
};

// Construction stages with completion factor (share of a full build).
export interface Stage {
  key: string;
  label: string;
  description: string;
  factor: number; // 0..1 share of full build cost
  addon?: boolean; // costed separately, not a share of the build
}

export const STAGES: Stage[] = [
  {
    key: "fencing",
    label: "Fencing",
    description: "Site boundary fencing — block wall with reinforced pillars.",
    factor: 0,
    addon: true,
  },
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
