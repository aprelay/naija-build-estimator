// Construction programme: phase durations in weeks, some scale per floor.

export interface PhaseDef {
  key: string;
  label: string;
  icon: string;
  baseWeeks: number;
  perFloorWeeks?: number;
  stageKeys: string[]; // estimate stages this phase belongs to
}

export const PHASES: PhaseDef[] = [
  { key: "siteprep", label: "Site Preparation & Setting Out", icon: "📐", baseWeeks: 1, stageKeys: ["foundation"] },
  { key: "excavation", label: "Excavation & Earthworks", icon: "🚧", baseWeeks: 2, stageKeys: ["foundation"] },
  { key: "foundation", label: "Foundation & Ground Floor Slab", icon: "🪨", baseWeeks: 3, stageKeys: ["foundation"] },
  { key: "frame", label: "Columns, Beams & Upper Slabs", icon: "🏛️", baseWeeks: 2, perFloorWeeks: 4, stageKeys: ["superstructure"] },
  { key: "blockwork", label: "Blockwork & Walling", icon: "🧱", baseWeeks: 3, perFloorWeeks: 1, stageKeys: ["superstructure"] },
  { key: "roofing", label: "Roof Structure & Covering", icon: "🏠", baseWeeks: 3, stageKeys: ["superstructure"] },
  { key: "plastering", label: "Plastering & Rendering", icon: "🎨", baseWeeks: 2, perFloorWeeks: 1, stageKeys: ["plastering"] },
  { key: "mep", label: "MEP Rough-in & Installation", icon: "⚡", baseWeeks: 4, stageKeys: ["mep"] },
  { key: "finishes", label: "Openings, Tiling & Painting", icon: "🚪", baseWeeks: 4, perFloorWeeks: 1, stageKeys: ["finishes"] },
  { key: "external", label: "External Works & Landscaping", icon: "🌳", baseWeeks: 2, stageKeys: ["finishes"] },
  { key: "handover", label: "Snagging & Handover", icon: "✅", baseWeeks: 1, stageKeys: ["finishes"] },
];

export interface TimelinePhase {
  key: string;
  label: string;
  icon: string;
  startWeek: number; // 0-based
  weeks: number;
}

export function computeTimeline(storeys: number, stages: string[]): TimelinePhase[] {
  const floors = Math.max(1, storeys === 0 ? 1 : storeys);
  const upperFloors = storeys === 0 ? 0 : storeys;
  const full = stages.length === 0 || stages.includes("full");
  let cursor = 0;
  const phases: TimelinePhase[] = [];
  for (const p of PHASES) {
    if (!full && !p.stageKeys.some((k) => stages.includes(k))) continue;
    const scale = p.key === "frame" ? upperFloors : floors - 1;
    const weeks = Math.max(1, Math.round(p.baseWeeks + (p.perFloorWeeks ?? 0) * Math.max(0, scale)));
    phases.push({ key: p.key, label: p.label, icon: p.icon, startWeek: cursor, weeks });
    cursor += weeks;
  }
  return phases;
}

export function totalWeeks(phases: TimelinePhase[]): number {
  return phases.reduce((m, p) => Math.max(m, p.startWeek + p.weeks), 0);
}
