import { useMemo, useState, useEffect } from "react";
import {
  DEFAULT_PRICES,
  FORMWORK_TYPES,
  FOUNDATION_TYPES,
  FX_RATES,
  ROOF_TYPES,
  SCAFFOLDING_TYPES,
  STAGES,
  STATES,
  SUBTYPES,
} from "./engine/data";
import type { BuildingType, UnitPrices } from "./engine/data";
import { autoColumns, computeEstimate, formatNaira } from "./engine/estimate";
import type { EstimateInput } from "./engine/estimate";
import { exportEstimatePdf } from "./engine/pdf";
import { computeTimeline, totalWeeks } from "./engine/timeline";
import { extractPlan } from "./engine/plan";
import { loadAdminSettings } from "./engine/admin";
import type { AdminSettings } from "./engine/admin";
import AdminPanel from "./AdminPanel";

interface SavedEstimate {
  id: string;
  projectName: string;
  total: number;
  date: string;
  input: EstimateInput;
}

const HISTORY_KEY = "nbe_history";
const PRICES_KEY = "nbe_prices";
const PRICES_CUSTOM_KEY = "nbe_prices_custom";

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

function hasCustomPrices(): boolean {
  return localStorage.getItem(PRICES_CUSTOM_KEY) === "1";
}

type Tab = "estimate" | "timeline" | "prices" | "history";

function addWeeks(dateStr: string, weeks: number): Date {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + Math.round(weeks * 7));
  return d;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default function App() {
  const [tab, setTab] = useState<Tab>("estimate");
  const [buildingType, setBuildingType] = useState<BuildingType>("residential");
  const [subtype, setSubtype] = useState("bungalow");
  const [floorArea, setFloorArea] = useState("");
  const [storeys, setStoreys] = useState(0);
  const [columns, setColumns] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [roofType, setRoofType] = useState("pitched_gable");
  const [foundationType, setFoundationType] = useState("strip_pad");
  const [formwork, setFormwork] = useState("marine_board");
  const [scaffolding, setScaffolding] = useState("bamboo");
  const [columnHeight, setColumnHeight] = useState("");
  const [columnWidthMm, setColumnWidthMm] = useState("");
  const [columnDepthMm, setColumnDepthMm] = useState("");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [state, setState] = useState("Lagos");
  const [blockPrice, setBlockPrice] = useState(750);
  const [stages, setStages] = useState<string[]>(["full"]);
  const [projectName, setProjectName] = useState("");
  const [prices, setPrices] = useState<UnitPrices>(loadPrices());
  const [marketPrices, setMarketPrices] = useState<UnitPrices | null>(null);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [publishStatus, setPublishStatus] = useState("");
  const [currency, setCurrency] = useState<string>("NGN");
  const [history, setHistory] = useState<SavedEstimate[]>(loadHistory());
  const [openTrades, setOpenTrades] = useState(true);
  const [planStatus, setPlanStatus] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(() => loadAdminSettings());
  const [roofingMaterial, setRoofingMaterial] = useState("");
  const [includeWaterTank, setIncludeWaterTank] = useState(false);

  useEffect(() => {
    localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
  }, [prices]);

  useEffect(() => {
    fetch("/api/prices")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { prices: UnitPrices | null; updatedAt: string | null } | null) => {
        if (!data?.prices) return;
        const merged = { ...DEFAULT_PRICES, ...data.prices };
        setMarketPrices(merged);
        setMarketUpdatedAt(data.updatedAt);
        if (!hasCustomPrices()) setPrices(merged);
      })
      .catch(() => {});
  }, []);

  function editPrice(k: keyof UnitPrices, value: number) {
    localStorage.setItem(PRICES_CUSTOM_KEY, "1");
    setPrices((p) => ({ ...p, [k]: value }));
  }

  function resetPrices() {
    localStorage.removeItem(PRICES_CUSTOM_KEY);
    setPrices(marketPrices ? { ...marketPrices } : { ...DEFAULT_PRICES });
  }

  async function publishPrices() {
    setPublishStatus("Publishing…");
    try {
      const res = await fetch("/api/prices", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminKey}` },
        body: JSON.stringify(prices),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setPublishStatus(`Failed: ${err?.error ?? res.status}`);
        return;
      }
      const data = (await res.json()) as { prices: UnitPrices; updatedAt: string };
      setMarketPrices({ ...DEFAULT_PRICES, ...data.prices });
      setMarketUpdatedAt(data.updatedAt);
      setPublishStatus("Published — all users now see these prices.");
    } catch {
      setPublishStatus("Failed: network error");
    }
  }

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
      length: parseFloat(length) || 0,
      width: parseFloat(width) || 0,
      roofType,
      foundationType,
      formwork,
      scaffolding,
      columnHeight: parseFloat(columnHeight) || 0,
      columnWidthMm: parseFloat(columnWidthMm) || 0,
      columnDepthMm: parseFloat(columnDepthMm) || 0,
      roofingMaterial: roofingMaterial || undefined,
      includeWaterTank,
      admin: adminSettings,
    }),
    [buildingType, subtype, area, storeys, columns, state, blockPrice, stages, prices,
      length, width, roofType, foundationType, formwork, scaffolding,
      columnHeight, columnWidthMm, columnDepthMm, roofingMaterial, includeWaterTank, adminSettings],
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
    setLength(i.length ? String(i.length) : "");
    setWidth(i.width ? String(i.width) : "");
    setRoofType(i.roofType || "pitched_gable");
    setFoundationType(i.foundationType || "strip_pad");
    setFormwork(i.formwork || "marine_board");
    setScaffolding(i.scaffolding || "bamboo");
    setColumnHeight(i.columnHeight ? String(i.columnHeight) : "");
    setColumnWidthMm(i.columnWidthMm ? String(i.columnWidthMm) : "");
    setColumnDepthMm(i.columnDepthMm ? String(i.columnDepthMm) : "");
    setProjectName(e.projectName);
    setTab("estimate");
  }

  function deleteHistory(id: string) {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  async function onPlanFile(file: File | undefined) {
    if (!file) return;
    setPlanStatus("Reading plan…");
    try {
      const p = await extractPlan(file);
      if (!p.areaSqm && !p.lengthM) {
        setPlanStatus("Couldn't detect an area on the plan — please enter it manually.");
        return;
      }
      if (p.areaSqm) setFloorArea(String(p.areaSqm));
      if (p.lengthM) setLength(String(p.lengthM));
      if (p.widthM) setWidth(String(p.widthM));
      setPlanStatus(
        `Detected${p.areaSqm ? ` area ${p.areaSqm} sqm` : ""}${p.lengthM ? ` · ${p.lengthM}m × ${p.widthM}m` : ""} — review below.`,
      );
    } catch (e) {
      setPlanStatus(e instanceof Error ? e.message : "Could not read that file.");
    }
  }

  const timeline = useMemo(() => computeTimeline(storeys, stages), [storeys, stages]);

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
              <h2>📐 Architectural Plan Upload</h2>
              <p className="hint">Upload a floor plan PDF or SVG (e.g. Matterport export) — we'll auto-detect the floor area and dimensions.</p>
              <label className="upload-box">
                <input
                  type="file"
                  accept="application/pdf,image/svg+xml,.svg"
                  onChange={(e) => onPlanFile(e.target.files?.[0])}
                  hidden
                />
                📄 Tap to choose a PDF or SVG floor plan
              </label>
              {planStatus && <p className="hint">{planStatus}</p>}
            </section>

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
                  <label>Building Length (m)</label>
                  <input
                    type="number"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    placeholder="e.g. 20 (optional)"
                  />
                </div>
                <div className="field">
                  <label>Building Width (m)</label>
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    placeholder="e.g. 15 (optional)"
                  />
                </div>
              </div>
              <div className="grid2">
                <div className="field">
                  <label>Roof Type</label>
                  <select value={roofType} onChange={(e) => setRoofType(e.target.value)}>
                    {ROOF_TYPES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Foundation Type</label>
                  <select value={foundationType} onChange={(e) => setFoundationType(e.target.value)}>
                    {FOUNDATION_TYPES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
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
              <div className="subhead">🏛️ Column Schedule — feeds concrete & steel</div>
              <div className="grid3">
                <div className="field">
                  <label>Height / storey (m)</label>
                  <input
                    type="number"
                    value={columnHeight}
                    onChange={(e) => setColumnHeight(e.target.value)}
                    placeholder="3.0"
                  />
                </div>
                <div className="field">
                  <label>Width (mm)</label>
                  <input
                    type="number"
                    value={columnWidthMm}
                    onChange={(e) => setColumnWidthMm(e.target.value)}
                    placeholder="300"
                  />
                </div>
                <div className="field">
                  <label>Depth (mm)</label>
                  <input
                    type="number"
                    value={columnDepthMm}
                    onChange={(e) => setColumnDepthMm(e.target.value)}
                    placeholder="300"
                  />
                </div>
              </div>
              <div className="subhead">🪵 Materials & Preferences — Timber & Woods</div>
              <div className="grid2">
                <div className="field">
                  <label>Formwork Type</label>
                  <select value={formwork} onChange={(e) => setFormwork(e.target.value)}>
                    {FORMWORK_TYPES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Scaffolding Type</label>
                  <select value={scaffolding} onChange={(e) => setScaffolding(e.target.value)}>
                    {SCAFFOLDING_TYPES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Roofing Material</label>
                  <select value={roofingMaterial} onChange={(e) => setRoofingMaterial(e.target.value)}>
                    <option value="">Default Sheet · ₦{prices.roofingSheet.toLocaleString()}/m²</option>
                    {Object.entries(adminSettings.roofing.gauges).map(([g, rate]) => (
                      <option key={g} value={g}>Aluminium {g} · ₦{rate.toLocaleString()}/m²</option>
                    ))}
                    <option value="tiles">Roof Tiles · ₦{adminSettings.roofing.tiles.toLocaleString()}/m²</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="stage-inline">
                  <input
                    type="checkbox"
                    checked={includeWaterTank}
                    onChange={(e) => setIncludeWaterTank(e.target.checked)}
                  />
                  💧 Include overhead water tank stand (MEP add-on)
                </label>
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
                  <div className="chips">
                    {[{ key: "all", label: "🏗️ All Trades" }, ...result.trades.map((t) => ({ key: t.key, label: `${t.icon} ${t.label.split(" ")[0].replace(/[(),]/g, "")}` }))].map((c) => (
                      <button
                        key={c.key}
                        className={tradeFilter === c.key ? "chip active" : "chip"}
                        onClick={() => setTradeFilter(c.key)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
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
                      {result.trades.filter((t) => tradeFilter === "all" || t.key === tradeFilter).map((t) => (
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
              <section className="card">
                <h2>🏗️ Stage-by-Stage Cost Breakdown</h2>
                <p className="hint">Approximate cost of each stage for the full build.</p>
                <table className="trades">
                  <tbody>
                    {result.stageBreakdown.map((s) => (
                      <tr key={s.key}>
                        <td>{s.label}</td>
                        <td className="strong">{convert(s.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {result && (
              <section className="card">
                <h2>🚛 Transportation & Logistics</h2>
                <p className="hint">Estimated delivery trips — not included in the total above.</p>
                <table className="trades">
                  <tbody>
                    {result.transport.map((t) => (
                      <tr key={t.item}>
                        <td>{t.item}</td>
                        <td>{t.trips} trip{t.trips !== 1 ? "s" : ""}</td>
                        <td className="strong">{convert(t.cost)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="strong">Logistics total</td>
                      <td></td>
                      <td className="strong">{convert(result.transportTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            )}

            {result && (
              <section className="card">
                <h2>💳 Payment Terms & Schedule</h2>
                <p className="hint">Suggested milestone payment plan for the selected scope.</p>
                <table className="trades">
                  <tbody>
                    {result.paymentSchedule.map((p) => (
                      <tr key={p.label}>
                        <td>{p.label}</td>
                        <td>{Math.round(p.pct * 100)}%</td>
                        <td className="strong">{convert(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

        {tab === "timeline" && (
          <section className="card">
            <h2>📅 Construction Timeline</h2>
            <div className="timeline-hero">
              <div className="hint">ESTIMATED PROJECT DURATION</div>
              <div className="timeline-duration">{totalWeeks(timeline)} weeks</div>
              <div className="hint">≈{(totalWeeks(timeline) / 4.33).toFixed(1)} months · {storeys === 0 ? "bungalow" : `${storeys} storey${storeys > 1 ? "s" : ""}`} · completion {fmtDate(addWeeks(startDate, totalWeeks(timeline)))}</div>
            </div>
            <div className="field">
              <label>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="gantt">
              {timeline.map((p) => (
                <div className="gantt-row" key={p.key}>
                  <div className="gantt-label">
                    {p.icon} {p.label}
                  </div>
                  <div className="gantt-track">
                    <div
                      className="gantt-bar"
                      style={{
                        left: `${(p.startWeek / totalWeeks(timeline)) * 100}%`,
                        width: `${(p.weeks / totalWeeks(timeline)) * 100}%`,
                      }}
                    >
                      {p.weeks}w
                    </div>
                  </div>
                  <div className="gantt-dates">
                    {fmtDate(addWeeks(startDate, p.startWeek))} → {fmtDate(addWeeks(startDate, p.startWeek + p.weeks))}
                  </div>
                </div>
              ))}
            </div>
            <h2>📋 Phase Summary</h2>
            <table className="trades">
              <thead>
                <tr><th>Phase</th><th>Weeks</th><th>End Date</th></tr>
              </thead>
              <tbody>
                {timeline.map((p) => (
                  <tr key={p.key}>
                    <td>{p.icon} {p.label}</td>
                    <td>{p.weeks}</td>
                    <td>{fmtDate(addWeeks(startDate, p.startWeek + p.weeks))}</td>
                  </tr>
                ))}
                <tr>
                  <td className="strong">TOTAL</td>
                  <td className="strong">{totalWeeks(timeline)}</td>
                  <td className="strong">{fmtDate(addWeeks(startDate, totalWeeks(timeline)))}</td>
                </tr>
              </tbody>
            </table>
            <p className="hint">
              Indicative for steady funding and normal weather — phases may overlap in practice. Allow buffer for permits, procurement and rainy season.
            </p>
          </section>
        )}

        {tab === "prices" && (
          <section className="card">
            <h2>⚙️ Unit Prices (₦)</h2>
            <p className="hint">
              Adjust to your local market. Saved automatically on this device.
              {marketUpdatedAt &&
                ` Market prices last published ${new Date(marketUpdatedAt).toLocaleDateString("en-NG")}.`}
            </p>
            {(Object.keys(prices) as (keyof UnitPrices)[]).map((k) => (
              <div className="field" key={k}>
                <label>{PRICE_LABELS[k]}</label>
                <input
                  type="number"
                  value={prices[k]}
                  onChange={(e) => editPrice(k, parseFloat(e.target.value) || 0)}
                />
              </div>
            ))}
            <button className="secondary" onClick={resetPrices}>
              ↺ Reset to market prices
            </button>
            <div className="admin-box">
              <h3>🔐 Admin — publish market prices</h3>
              <p className="hint">
                With the admin key, publish the prices above as the market default for all users.
              </p>
              <div className="field">
                <label>Admin key</label>
                <input
                  type="password"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  placeholder="Enter admin key"
                />
              </div>
              <button className="primary" onClick={publishPrices} disabled={!adminKey}>
                📢 Publish to all users
              </button>
              {publishStatus && <p className="hint">{publishStatus}</p>}
            </div>
          </section>
        )}

        {tab === "prices" && <AdminPanel settings={adminSettings} onChange={setAdminSettings} />}

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
        <button className={tab === "timeline" ? "on" : ""} onClick={() => setTab("timeline")}>
          📅<span>Timeline</span>
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
