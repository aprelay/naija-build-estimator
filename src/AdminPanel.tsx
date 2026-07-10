import { useState } from "react";
import { STATES } from "./engine/data";
import { saveAdminSettings } from "./engine/admin";
import type { AdminSettings, GradeKey } from "./engine/admin";

const GRADE_KEYS: GradeKey[] = ["grade20", "grade25", "grade30", "grade35"];

const STAGE_LABELS: Record<string, string> = {
  foundation: "Foundation → Ground Floor Slab",
  superstructure: "Superstructure → Roof Level",
  plastering: "Plastering & Rendering",
  mep: "MEP Installation",
  finishes: "Openings & Finishes",
  full: "Full Completion",
};

const TRADE_LABELS: Record<string, string> = {
  excavation: "Excavation & Earthworks",
  concrete: "Concrete & Foundation",
  steel: "Steel Reinforcement",
  blockwork: "Masonry / Blockwork",
  roofing: "Roofing Works",
  timber: "Timber & Woods",
  electrical: "Electrical Installation",
  plumbing: "Plumbing & Sanitary",
  plastering: "Plastering & Rendering",
  finishing: "Finishes",
  external: "External Works",
};

interface Props {
  settings: AdminSettings;
  onChange: (s: AdminSettings) => void;
}

export default function AdminPanel({ settings, onChange }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinStatus, setPinStatus] = useState("");
  const [overrideState, setOverrideState] = useState("Lagos");

  function update(patch: Partial<AdminSettings>) {
    const next = { ...settings, ...patch };
    saveAdminSettings(next);
    onChange(next);
  }

  if (!unlocked) {
    return (
      <section className="card">
        <h2>🔐 Admin Access</h2>
        <p className="hint">Enter PIN to unlock price management (default 1234 — change it inside).</p>
        <div className="field">
          <input
            type="password"
            value={pinInput}
            placeholder="Enter PIN"
            onChange={(e) => setPinInput(e.target.value)}
          />
        </div>
        {pinError && <p className="hint">{pinError}</p>}
        <button
          className="primary"
          onClick={() => {
            if (pinInput === settings.pin) {
              setUnlocked(true);
              setPinError("");
            } else setPinError("Incorrect PIN.");
          }}
        >
          Unlock
        </button>
      </section>
    );
  }

  const ex = settings.excavation;
  const ov = ex.stateOverrides[overrideState] ?? {};
  const t = settings.tank;

  return (
    <>
      <section className="card">
        <h2>📐 Aggregate Calculator — Rates per 100 m³ Concrete</h2>
        <p className="hint">Material consumption per 100 m³ of finished concrete for each grade.</p>
        {GRADE_KEYS.map((g) => {
          const gr = settings.grades[g];
          return (
            <div key={g}>
              <div className="subhead">{gr.label}</div>
              <div className="grid2">
                <div className="field">
                  <label>Cement (bags/100m³)</label>
                  <input
                    type="number"
                    value={gr.cementBags}
                    onChange={(e) =>
                      update({ grades: { ...settings.grades, [g]: { ...gr, cementBags: +e.target.value } } })
                    }
                  />
                </div>
                <div className="field">
                  <label>Granite (t/100m³)</label>
                  <input
                    type="number"
                    value={gr.graniteT}
                    onChange={(e) =>
                      update({ grades: { ...settings.grades, [g]: { ...gr, graniteT: +e.target.value } } })
                    }
                  />
                </div>
                <div className="field">
                  <label>Sharp Sand (m³/100m³)</label>
                  <input
                    type="number"
                    value={gr.sandM3}
                    onChange={(e) =>
                      update({ grades: { ...settings.grades, [g]: { ...gr, sandM3: +e.target.value } } })
                    }
                  />
                </div>
                <div className="field">
                  <label>Water (L/100m³)</label>
                  <input
                    type="number"
                    value={gr.waterL}
                    onChange={(e) =>
                      update({ grades: { ...settings.grades, [g]: { ...gr, waterL: +e.target.value } } })
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="card">
        <h2>🪨 Concrete Grade / Mix Ratio per Stage</h2>
        <p className="hint">Select concrete grade for each construction stage.</p>
        {Object.entries(STAGE_LABELS).map(([stage, label]) => (
          <div className="field" key={stage}>
            <label>{label}</label>
            <select
              value={settings.stageGrades[stage] ?? "grade25"}
              onChange={(e) =>
                update({ stageGrades: { ...settings.stageGrades, [stage]: e.target.value as GradeKey } })
              }
            >
              {GRADE_KEYS.map((g) => (
                <option key={g} value={g}>{settings.grades[g].label}</option>
              ))}
            </select>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>🏗️ Roofing Material Prices (₦ / m²)</h2>
        <div className="subhead">Aluminium Roofing Sheets</div>
        <div className="grid2">
          {Object.entries(settings.roofing.gauges).map(([gauge, rate]) => (
            <div className="field" key={gauge}>
              <label>{gauge} Gauge</label>
              <input
                type="number"
                value={rate}
                onChange={(e) =>
                  update({
                    roofing: {
                      ...settings.roofing,
                      gauges: { ...settings.roofing.gauges, [gauge]: +e.target.value },
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
        <div className="subhead">Tiles & Accessories</div>
        <div className="grid3">
          <div className="field">
            <label>Roof Tiles</label>
            <input
              type="number"
              value={settings.roofing.tiles}
              onChange={(e) => update({ roofing: { ...settings.roofing, tiles: +e.target.value } })}
            />
          </div>
          <div className="field">
            <label>Nails & Fasteners</label>
            <input
              type="number"
              value={settings.roofing.nails}
              onChange={(e) => update({ roofing: { ...settings.roofing, nails: +e.target.value } })}
            />
          </div>
          <div className="field">
            <label>Adhesive & Sealant</label>
            <input
              type="number"
              value={settings.roofing.sealant}
              onChange={(e) => update({ roofing: { ...settings.roofing, sealant: +e.target.value } })}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <h2>⛏️ Excavation Settings — Partition System</h2>
        <p className="hint">Partition = 3.5 m of foundation trench. Trench length = columns × 5 m + 10%.</p>
        <div className="field">
          <label>Excavation Method</label>
          <div className="chips">
            <button
              className={ex.method === "manual" ? "chip active" : "chip"}
              onClick={() => update({ excavation: { ...ex, method: "manual" } })}
            >
              👷 Manual Labour
            </button>
            <button
              className={ex.method === "machinery" ? "chip active" : "chip"}
              onClick={() => update({ excavation: { ...ex, method: "machinery" } })}
            >
              🚜 Machinery / JCB
            </button>
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <label>Manual — ₦/partition</label>
            <input
              type="number"
              value={ex.manualPerPartition}
              onChange={(e) => update({ excavation: { ...ex, manualPerPartition: +e.target.value } })}
            />
          </div>
          <div className="field">
            <label>Machinery — ₦/partition</label>
            <input
              type="number"
              value={ex.machineryPerPartition}
              onChange={(e) => update({ excavation: { ...ex, machineryPerPartition: +e.target.value } })}
            />
          </div>
          <div className="field">
            <label>Column Base — ₦/base</label>
            <input
              type="number"
              value={ex.columnBaseFee}
              onChange={(e) => update({ excavation: { ...ex, columnBaseFee: +e.target.value } })}
            />
          </div>
          <div className="field">
            <label>Compaction Water — ₦/1,000 L</label>
            <input
              type="number"
              value={ex.compactionWaterPer1000L}
              onChange={(e) => update({ excavation: { ...ex, compactionWaterPer1000L: +e.target.value } })}
            />
          </div>
        </div>
        <div className="subhead">Per-State Rate Override (blank = global default)</div>
        <div className="field">
          <label>State</label>
          <select value={overrideState} onChange={(e) => setOverrideState(e.target.value)}>
            {STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="grid3">
          <div className="field">
            <label>Manual ₦/partition</label>
            <input
              type="number"
              value={ov.manual ?? ""}
              placeholder="Global"
              onChange={(e) =>
                update({
                  excavation: {
                    ...ex,
                    stateOverrides: {
                      ...ex.stateOverrides,
                      [overrideState]: { ...ov, manual: e.target.value === "" ? undefined : +e.target.value },
                    },
                  },
                })
              }
            />
          </div>
          <div className="field">
            <label>Machinery ₦/partition</label>
            <input
              type="number"
              value={ov.machinery ?? ""}
              placeholder="Global"
              onChange={(e) =>
                update({
                  excavation: {
                    ...ex,
                    stateOverrides: {
                      ...ex.stateOverrides,
                      [overrideState]: { ...ov, machinery: e.target.value === "" ? undefined : +e.target.value },
                    },
                  },
                })
              }
            />
          </div>
          <div className="field">
            <label>Column Base ₦/base</label>
            <input
              type="number"
              value={ov.columnBase ?? ""}
              placeholder="Global"
              onChange={(e) =>
                update({
                  excavation: {
                    ...ex,
                    stateOverrides: {
                      ...ex.stateOverrides,
                      [overrideState]: { ...ov, columnBase: e.target.value === "" ? undefined : +e.target.value },
                    },
                  },
                })
              }
            />
          </div>
        </div>
      </section>

      <section className="card">
        <h2>💧 Overhead Water Tank Stand Prices (₦)</h2>
        <p className="hint">Applied when the water tank add-on is enabled at the MEP stage.</p>
        <div className="grid2">
          {(
            [
              ["hChannel6", '6" H Channel (per length)'],
              ["hChannel9", '9" H Channel (per length)'],
              ["basePlate", "Base Plate 12mm (×4)"],
              ["foundationBolt", "Foundation Bolt (×16)"],
              ["rod12mm", "12mm Rod (×2)"],
              ["hChannel4", '4" H Channel (×10)'],
              ["angleIron3", '3"×4mm Angle Iron (×32)'],
              ["angleIron5", '5"×4mm Angle Iron (3+ storeys)'],
              ["flatSheet18g", "18 Gauge Flat Sheet (×3)"],
              ["ironMesh", "Iron Mesh (alt. cladding)"],
              ["paint", "Paint (×2)"],
              ["labourPct", "Labour (% of materials)"],
            ] as [keyof typeof t, string][]
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input
                type="number"
                value={t[key]}
                onChange={(e) => update({ tank: { ...t, [key]: +e.target.value } })}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>👷 Labour / Workmanship Rates (₦ per m²)</h2>
        <p className="hint">Base workmanship rates per trade, scaled by area, state multiplier and stage factors.</p>
        <div className="grid2">
          {(
            [
              ["foundation", "Foundation works"],
              ["concrete", "Concrete casting"],
              ["blockwork", "Blockwork / masonry"],
              ["roofing", "Roofing (per m² roof)"],
              ["electrical", "Electrical installation"],
              ["plumbing", "Plumbing & sanitary"],
              ["plastering", "Plastering (per m² wall)"],
              ["flooring", "Floor finishes"],
              ["painting", "Painting"],
              ["carpentry", "Carpentry & joinery"],
              ["external", "External works"],
            ] as [keyof typeof settings.labour, string][]
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input
                type="number"
                value={settings.labour[key]}
                onChange={(e) => update({ labour: { ...settings.labour, [key]: +e.target.value } })}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>👁️ Trade Visibility</h2>
        <p className="hint">Hidden trades are excluded from the grand total and the estimate view.</p>
        {Object.entries(TRADE_LABELS).map(([key, label]) => {
          const hidden = settings.hiddenTrades.includes(key);
          return (
            <div className="row-between" key={key}>
              <span>{label}{hidden ? " — hidden" : ""}</span>
              <button
                className={hidden ? "chip" : "chip active"}
                onClick={() =>
                  update({
                    hiddenTrades: hidden
                      ? settings.hiddenTrades.filter((k) => k !== key)
                      : [...settings.hiddenTrades, key],
                  })
                }
              >
                {hidden ? "Show" : "Hide"}
              </button>
            </div>
          );
        })}
      </section>

      <section className="card">
        <h2>🔐 Security</h2>
        <div className="grid2">
          <div className="field">
            <label>New PIN</label>
            <input type="password" value={newPin} placeholder="Min 4 digits" onChange={(e) => setNewPin(e.target.value)} />
          </div>
          <div className="field">
            <label>Confirm PIN</label>
            <input type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} />
          </div>
        </div>
        {pinStatus && <p className="hint">{pinStatus}</p>}
        <button
          className="primary"
          onClick={() => {
            if (newPin.length < 4) return setPinStatus("PIN must be at least 4 digits.");
            if (newPin !== confirmPin) return setPinStatus("PINs do not match.");
            update({ pin: newPin });
            setNewPin("");
            setConfirmPin("");
            setPinStatus("PIN changed.");
          }}
        >
          Change PIN
        </button>
      </section>

    </>
  );
}
