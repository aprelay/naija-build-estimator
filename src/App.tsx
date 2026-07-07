import { useMemo, useState, useEffect } from "react";
import {
  DEFAULT_PRICES,
  FX_RATES,
  STAGES,
  STATES,
  SUBTYPES,
} from "./engine/data";
import type { BuildingType, UnitPrices } from "./engine/data";
import { autoColumns, computeEstimate, formatNaira } from "./engine/estimate";
import type { EstimateInput } from "./engine/estimate";
import { exportEstimatePdf } from "./engine/pdf";

interface SavedEstimate {
  id: string;
  projectName: string;
  total: number;
  date: string;
  input: EstimateInput;
}

const HISTORY_KEY = "nbe_history";
const PRICES_KEY = "nbe_prices";

function loadHistory(): SavedEstimate[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function loadPrices(): UnitPrices {
  try {
    const saved = localStorage.getItem(PRICES_KEY);
    return saved ? { ...DEFAULT_PRICES, ...JSON.parse(saved) } : { ...DEFAULT_PRICES };
  } catch {
    return { ...DEFAULT_PRICES };
  }
}

type Tab = "estimate" | "prices" | "history";

export default function App() {
  const [tab, setTab] = useState<Tab>("estimate");
  const [buildingType, setBuildingType] = useState<BuildingType>("residential");
  const [subtype, setSubtype] = useState("bungalow");
  const [floorArea, setFloorArea] = useState("");
  const [storeys, setStoreys] = useState(0);
  const [columns, setColumns] = useState("");
  const [state, setState] = useState("Lagos");
  const [blockPrice, setBlockPrice] = useState(750);
  const [stages, setStages] = useState<string[]>(["full"]);
  const [projectName, setProjectName] = useState("");
  const [prices, setPrices] = useState<UnitPrices>(loadPrices());
  const [currency, setCurrency] = useState<string>("NGN");
  const [history, setHistory] = useState<SavedEstimate[]>(loadHistory());
  const [openTrades, setOpenTrades] = useState(true);

  useEffect(() => {
    localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
  }, [prices]);

  const area = parseFloat(floorArea) || 0;

  const input: EstimateInput = useMemo(
    () => ({
      buildingType,
      subtype,
      floorArea: area,
      storeys,
      columns: parseInt(columns) || 0,
      state,
      blockPrice,
      stages,
      prices,
    }),
    [buildingType, subtype, area, storeys, columns, state, blockPrice, stages, prices],
  );

  const result = useMemo(() => (area > 0 ? computeEstimate(input) : null), [input, area]);

  function toggleStage(key: string) {
    setStages((prev) => {
      if (key === "full") return prev.includes("full") ? [] : ["full"];
      const withoutFull = prev.filter((k) => k !== "full");
      return withoutFull.includes(key)
        ? withoutFull.filter((k) => k !== key)
        : [...withoutFull, key];
    });
  }

  function convert(n: number): string {
    if (currency === "NGN") return formatNaira(n);
    const rate = FX_RATES[currency];
    const val = n / rate;
    return `${currency} ${val.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }

  function onSelectBuildingType(t: BuildingType) {
    setBuildingType(t);
    const first = SUBTYPES[t][0];
    setSubtype(first.value);
    setStoreys(first.storeys);
  }

  function onSelectSubtype(v: string) {
    setSubtype(v);
    const s = SUBTYPES[buildingType].find((x) => x.value === v);
    if (s) setStoreys(s.storeys);
  }

  function saveToHistory() {
    if (!result) return;
    const entry: SavedEstimate = {
      id: String(Date.now()),
      projectName: projectName || "Untitled Project",
      total: result.total,
      date: new Date().toISOString(),
      input,
    };
    const next = [entry, ...history].slice(0, 50);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  function loadFromHistory(e: SavedEstimate) {
    const i = e.input;
    setBuildingType(i.buildingType);
    setSubtype(i.subtype);
    setFloorArea(String(i.floorArea));
    setStoreys(i.storeys);
    setColumns(i.columns ? String(i.columns) : "");
    setState(i.state);
    setBlockPrice(i.blockPrice);
    setStages(i.stages);
    setProjectName(e.projectName);
    setTab("estimate");
  }

  function deleteHistory(id: string) {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  const topTrade = result
    ? [...result.trades].sort((a, b) => b.total - a.total)[0]
    : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🏗️</span>
          <div>
            <h1>Naija Build Estimator</h1>
            <p>Construction Cost & BOQ · Nigeria</p>
          </div>
        </div>
      </header>

      <main className="content">
        {tab === "estimate" && (
          <>
            {result && (
              <section className="total-card">
                <div className="total-label">Total Project Estimate</div>
                <div className="total-value">{convert(result.total)}</div>
                <div className="fx-row">
                  {["NGN", "USD", "GBP", "EUR", "CAD", "AUD"].map((c) => (
                    <button
                      key={c}
                      className={currency === c ? "fx active" : "fx"}
                      onClick={() => setCurrency(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="total-meta">
                  {area} sqm · {storeys === 0 ? "Bungalow" : `${storeys} storey${storeys > 1 ? "s" : ""}`} ·{" "}
                  {state} · excl. VAT
                  {topTrade && ` · Top: ${topTrade.label} (${Math.round((topTrade.total / result.total) * 100)}%)`}
                </div>
              </section>
            )}

            <section className="card">
              <h2>🏛️ Building Overview</h2>
              <div className="field">
                <label>Project / Client Name</label>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Adeyemi Residence"
                />
              </div>
              <div className="grid2">
                <div className="field">
                  <label>Building Type</label>
                  <select value={buildingType} onChange={(e) => onSelectBuildingType(e.target.value as BuildingType)}>
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                  </select>
                </div>
                <div className="field">
                  <label>Subtype</label>
                  <select value={subtype} onChange={(e) => onSelectSubtype(e.target.value)}>
                    {SUBTYPES[buildingType].map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid2">
                <div className="field">
                  <label>Floor Plan Area (sqm) *</label>
                  <input
                    type="number"
                    value={floorArea}
                    onChange={(e) => setFloorArea(e.target.value)}
                    placeholder="e.g. 250"
                  />
                </div>
                <div className="field">
                  <label>No. of Storeys</label>
                  <select value={storeys} onChange={(e) => setStoreys(parseInt(e.target.value))}>
                    <option value={0}>0 — Bungalow</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} storey{n > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid2">
                <div className="field">
                  <label>No. of Columns</label>
                  <input
                    type="number"
                    value={columns}
                    onChange={(e) => setColumns(e.target.value)}
                    placeholder={area ? `auto: ${autoColumns(area)}` : "auto"}
                  />
                  <small>Leave blank to auto-estimate (1 per 16 m²)</small>
                </div>
                <div className="field">
                  <label>State</label>
                  <select value={state} onChange={(e) => setState(e.target.value)}>
                    {STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Block Type</label>
                <div className="block-toggle">
                  <button
                    className={blockPrice === 750 ? "active" : ""}
                    onClick={() => setBlockPrice(750)}
                  >
                    🧱 Manual Mould · ₦750
                  </button>
                  <button
                    className={blockPrice === 1250 ? "active" : ""}
                    onClick={() => setBlockPrice(1250)}
                  >
                    🏭 Machine Vibrated · ₦1,250
                  </button>
                </div>
              </div>
            </section>

            <section className="card">
              <h2>🔨 Construction Stage</h2>
              <p className="hint">Select one or more stages — costs are summed. Full Completion overrides.</p>
              {STAGES.map((s) => (
                <label key={s.key} className={`stage ${stages.includes(s.key) ? "on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={stages.includes(s.key)}
                    onChange={() => toggleStage(s.key)}
                  />
                  <div>
                    <strong>{s.label}</strong>
                    <span>{s.description}</span>
                  </div>
                </label>
              ))}
            </section>

            {!result && (
              <div className="empty">🏗️ Enter floor area above to generate an estimate.</div>
            )}

            {result && (
              <section className="card">
                <div className="card-head" onClick={() => setOpenTrades((v) => !v)}>
                  <h2>📊 Trade Breakdown</h2>
                  <span>{openTrades ? "▲" : "▼"}</span>
                </div>
                {openTrades && (
                  <table className="trades">
                    <thead>
                      <tr>
                        <th>Trade</th>
                        <th>Material</th>
                        <th>Labour</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t) => (
                        <tr key={t.key}>
                          <td>
                            {t.icon} {t.label}
                          </td>
                          <td>{convert(t.material)}</td>
                          <td>{convert(t.labour)}</td>
                          <td className="strong">{convert(t.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}

            {result && (
              <section className="card">
                <h2>📦 Key Material Quantities</h2>
                <div className="qty-grid">
                  <div><span>Cement</span><strong>{result.quantities.cementBags.toLocaleString()} bags</strong></div>
                  <div><span>Steel</span><strong>{result.quantities.steelTonnes} t</strong></div>
                  <div><span>Sand</span><strong>{result.quantities.sandTrips} trips</strong></div>
                  <div><span>Granite</span><strong>{result.quantities.graniteTrips} trips</strong></div>
                  <div><span>Blocks</span><strong>{result.quantities.blocks.toLocaleString()}</strong></div>
                  <div><span>Roof area</span><strong>{result.quantities.roofAreaM2.toLocaleString()} m²</strong></div>
                </div>
              </section>
            )}

            {result && (
              <div className="actions">
                <button className="primary" onClick={() => exportEstimatePdf(input, result, projectName)}>
                  📄 Download PDF
                </button>
                <button className="secondary" onClick={saveToHistory}>
                  💾 Save Estimate
                </button>
              </div>
            )}
          </>
        )}

        {tab === "prices" && (
          <section className="card">
            <h2>⚙️ Unit Prices (₦)</h2>
            <p className="hint">Adjust to your local market. Saved automatically on this device.</p>
            {(Object.keys(prices) as (keyof UnitPrices)[]).map((k) => (
              <div className="field" key={k}>
                <label>{PRICE_LABELS[k]}</label>
                <input
                  type="number"
                  value={prices[k]}
                  onChange={(e) => setPrices({ ...prices, [k]: parseFloat(e.target.value) || 0 })}
                />
              </div>
            ))}
            <button className="secondary" onClick={() => setPrices({ ...DEFAULT_PRICES })}>
              ↺ Reset to defaults
            </button>
          </section>
        )}

        {tab === "history" && (
          <section className="card">
            <h2>📚 Saved Estimates</h2>
            {history.length === 0 && <p className="hint">No saved estimates yet.</p>}
            {history.map((h) => (
              <div className="history-item" key={h.id}>
                <div>
                  <strong>{h.projectName}</strong>
                  <span>
                    {formatNaira(h.total)} · {new Date(h.date).toLocaleDateString("en-NG")}
                  </span>
                </div>
                <div className="history-actions">
                  <button onClick={() => loadFromHistory(h)}>Load</button>
                  <button onClick={() => deleteHistory(h.id)}>✕</button>
                </div>
              </div>
            ))}
          </section>
        )}
      </main>

      <nav className="tabbar">
        <button className={tab === "estimate" ? "on" : ""} onClick={() => setTab("estimate")}>
          🏗️<span>Estimate</span>
        </button>
        <button className={tab === "prices" ? "on" : ""} onClick={() => setTab("prices")}>
          ⚙️<span>Prices</span>
        </button>
        <button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>
          📚<span>History</span>
        </button>
      </nav>
    </div>
  );
}

const PRICE_LABELS: Record<keyof UnitPrices, string> = {
  cement: "Cement (per 50kg bag)",
  steel: "Steel / Rebar (per tonne)",
  sand: "Sand (per trip)",
  granite: "Granite (per trip)",
  block: "Block (per unit)",
  roofingSheet: "Roofing sheet (per m²)",
};
