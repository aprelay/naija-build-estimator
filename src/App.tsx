import { useMemo, useState, useEffect, useRef } from "react";
import {
  BLOCK_OPTIONS,
  DEFAULT_PRICES,
  FORMWORK_TYPES,
  FOUNDATION_TYPES,
  FX_RATES,
  POOL_SIZES,
  ROOF_TYPES,
  SCAFFOLDING_TYPES,
  SITE_ADDONS,
  STAGES,
  STATES,
  STATE_SOIL,
  SUBTYPES,
} from "./engine/data";
import type { BuildingType, UnitPrices } from "./engine/data";
import { autoColumns, computeEstimate, formatNaira } from "./engine/estimate";
import type { EstimateInput } from "./engine/estimate";
import { exportEstimatePdf } from "./engine/pdf";
import { computeTimeline, totalWeeks } from "./engine/timeline";
import { extractPlan } from "./engine/plan";
import { loadAdminSettings, saveAdminSettings } from "./engine/admin";
import type { AdminSettings } from "./engine/admin";
import AdminPanel from "./AdminPanel";
import AccountPanel from "./AccountPanel";
import SuperAdmin from "./SuperAdmin";
import SupplierPanel from "./SupplierPanel";
import SuppliersDirectory from "./SuppliersDirectory";
import {
  consumeUsage,
  FREE_MONTHLY_LIMIT,
  isProSession,
  loadSession,
  monthlyUsage,
  recordUsage,
  refreshMe,
  saveSession,
} from "./engine/auth";
import type { AuthSession } from "./engine/auth";

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
const BRAND_KEY = "nbe_branding";

interface Branding {
  companyName: string;
  companyPhone: string;
  companyLogo: string;
}

function loadBranding(): Branding {
  try {
    return { companyName: "", companyPhone: "", companyLogo: "", ...JSON.parse(localStorage.getItem(BRAND_KEY) || "{}") };
  } catch {
    return { companyName: "", companyPhone: "", companyLogo: "" };
  }
}

// Downscale an uploaded logo to a small PNG data URL so it fits in cloud storage.
function fileToLogoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 300;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

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

type Tab = "estimate" | "timeline" | "prices" | "history" | "account";

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
  const [currency, setCurrency] = useState<string>("NGN");
  const [history, setHistory] = useState<SavedEstimate[]>(loadHistory());
  const [openTrades, setOpenTrades] = useState(true);
  const [planStatus, setPlanStatus] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [adminSettings, setAdminSettings] = useState<AdminSettings>(() => loadAdminSettings());
  const [roofingMaterial, setRoofingMaterial] = useState("");
  const [includeWaterTank, setIncludeWaterTank] = useState(false);
  const [siteAddons, setSiteAddons] = useState<string[]>([]);
  const [poolSize, setPoolSize] = useState("");
  const [contingencyPct, setContingencyPct] = useState("10");
  const [branding, setBranding] = useState(loadBranding());
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [pricesLocked, setPricesLocked] = useState(false);
  const [exportsUsed, setExportsUsed] = useState(() => monthlyUsage());
  const [adminMode, setAdminMode] = useState(() => window.location.hash === "#admin");
  const [pricePopOpen, setPricePopOpen] = useState(false);
  const [pricesSeenAt, setPricesSeenAt] = useState(() => localStorage.getItem("nbe_prices_seen") || "");

  useEffect(() => {
    const onHash = () => setAdminMode(window.location.hash === "#admin");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const pro = isProSession(session);

  function onSession(s: AuthSession | null) {
    saveSession(s);
    setSession(s);
  }

  // Re-check the plan on load (e.g. Pro expired, activated or locked on another device).
  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    refreshMe(s).then((user) => {
      if (user) onSession({ ...s, user });
    });
  }, []);

  // Per-account cloud sync: each user's dashboard (prices, branding, history,
  // settings) is stored under their own account and restored on login.
  const cloudReady = useRef(false);
  useEffect(() => {
    cloudReady.current = false;
    if (!session) return;
    fetch("/api/userdata", { headers: { Authorization: `Bearer ${session.token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: {
          data: {
            prices?: UnitPrices;
            custom?: boolean;
            branding?: Branding;
            history?: SavedEstimate[];
            adminSettings?: AdminSettings;
          } | null;
        } | null) => {
          const data = d?.data;
          if (data) {
            if (data.prices) {
              const merged = { ...DEFAULT_PRICES, ...data.prices };
              setPrices(merged);
              localStorage.setItem(PRICES_KEY, JSON.stringify(merged));
            }
            if (data.custom) localStorage.setItem(PRICES_CUSTOM_KEY, "1");
            if (data.branding) {
              setBranding(data.branding);
              localStorage.setItem(BRAND_KEY, JSON.stringify(data.branding));
            }
            if (data.history) {
              setHistory(data.history);
              localStorage.setItem(HISTORY_KEY, JSON.stringify(data.history));
            }
            if (data.adminSettings) {
              const merged = { ...loadAdminSettings(), ...data.adminSettings };
              setAdminSettings(merged);
              saveAdminSettings(merged);
            }
          }
          cloudReady.current = true;
        },
      )
      .catch(() => {
        cloudReady.current = true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.email]);

  useEffect(() => {
    if (!session || !cloudReady.current || session.user.locked) return;
    const t = setTimeout(() => {
      fetch("/api/userdata", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ prices, custom: hasCustomPrices(), branding, history, adminSettings }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [prices, branding, history, adminSettings, session]);

  useEffect(() => {
    localStorage.setItem(BRAND_KEY, JSON.stringify(branding));
  }, [branding]);

  useEffect(() => {
    localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
  }, [prices]);

  // Load market prices for the selected state (state-specific set falls back to
  // national). Current market prices are a Pro feature — free users keep the
  // built-in defaults.
  useEffect(() => {
    fetch(`/api/prices?state=${encodeURIComponent(state)}`, {
      headers: session ? { Authorization: `Bearer ${session.token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { prices: UnitPrices | null; updatedAt: string | null; locked?: boolean } | null) => {
        if (!data) return;
        setPricesLocked(!!data.locked);
        if (data.locked) setMarketUpdatedAt(data.updatedAt);
        if (!data.prices) return;
        const merged = { ...DEFAULT_PRICES, ...data.prices };
        setMarketPrices(merged);
        setMarketUpdatedAt(data.updatedAt);
        if (!hasCustomPrices()) setPrices(merged);
      })
      .catch(() => {});
  }, [state, session]);

  function editPrice(k: keyof UnitPrices, value: number) {
    localStorage.setItem(PRICES_CUSTOM_KEY, "1");
    setPrices((p) => ({ ...p, [k]: value }));
  }

  function resetPrices() {
    localStorage.removeItem(PRICES_CUSTOM_KEY);
    setPrices(marketPrices ? { ...marketPrices } : { ...DEFAULT_PRICES });
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
      siteAddons,
      poolSize,
      contingencyPct: parseFloat(contingencyPct) || 0,
      admin: adminSettings,
    }),
    [buildingType, subtype, area, storeys, columns, state, blockPrice, stages, prices,
      length, width, roofType, foundationType, formwork, scaffolding,
      columnHeight, columnWidthMm, columnDepthMm, roofingMaterial, includeWaterTank,
      siteAddons, poolSize, contingencyPct, adminSettings],
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

  function onSelectState(v: string) {
    setState(v);
    const soil = STATE_SOIL[v];
    if (soil) setFoundationType(soil.foundation);
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
      if (!pro && session) {
        await consumeUsage(session, "upload");
      }
      const p = await extractPlan(file);
      if (!p.areaSqm && !p.lengthM) {
        setPlanStatus("Couldn't detect an area on the plan — please enter it manually.");
        return;
      }
      if (p.areaSqm) setFloorArea(String(p.areaSqm));
      if (p.lengthM) setLength(String(p.lengthM));
      if (p.widthM) setWidth(String(p.widthM));
      if (p.hasPool && !poolSize) setPoolSize("medium");
      if (p.floors) setStoreys(Math.min(p.floors - 1, 10));
      setPlanStatus(
        `Detected${p.areaSqm ? ` area ${p.areaSqm} sqm` : ""}${p.lengthM ? ` · ${p.lengthM}m × ${p.widthM}m` : ""}${p.floors ? ` · ${p.floors === 1 ? "bungalow" : `${p.floors} floors (${p.floors - 1} storey${p.floors > 2 ? "s" : ""})`}` : ""}${p.hasPool ? " · 🏊 pool on plan (added — adjust size below)" : ""} — review below.`,
      );
    } catch (e) {
      setPlanStatus(e instanceof Error ? e.message : "Could not read that file.");
    }
  }

  function toggleAddon(key: string) {
    setSiteAddons((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function shareWhatsApp() {
    if (!result) return;
    const lines = [
      `*${projectName || "Construction Estimate"}* — ${branding.companyName || "Naija Build Estimator"}`,
      `${area} sqm · ${storeys === 0 ? "Bungalow" : `${storeys} storey${storeys > 1 ? "s" : ""}`} · ${state}`,
      ``,
      `*Total: ${formatNaira(result.grandTotal)}*`,
      ...(result.contingency > 0 ? [`(incl. ${formatNaira(result.contingency)} contingency)`] : []),
      ``,
      `Breakdown:`,
      ...result.trades.map((t) => `• ${t.label}: ${formatNaira(t.total)}`),
      ``,
      `Generated ${new Date().toLocaleDateString("en-NG")} · naija-build-estimator.pages.dev`,
    ];
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }

  const timeline = useMemo(() => computeTimeline(storeys, stages), [storeys, stages]);

  const topTrade = result
    ? [...result.trades].sort((a, b) => b.total - a.total)[0]
    : null;

  if (!session) {
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
          <section className="card">
            <h2>👋 Welcome</h2>
            <p className="hint">
              Instant construction cost estimates, BOQs, timelines and floor-plan analysis for Nigeria. Create a free
            account or log in to continue.
            </p>
          </section>
          <AccountPanel session={null} onSession={onSession} />
          {adminMode && (
            <SuperAdmin
              prices={prices}
              onPublished={(p, updatedAt) => {
                setMarketPrices({ ...DEFAULT_PRICES, ...p });
                setMarketUpdatedAt(updatedAt);
              }}
            />
          )}
        </main>
      </div>
    );
  }

  if (session && session.user.role === "supplier") {
    return (
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="logo">🏗️</span>
            <div>
              <h1>Naija Build Estimator</h1>
              <p>Supplier Portal · Nigeria</p>
            </div>
          </div>
        </header>
        <main className="content">
          <SupplierPanel session={session} />
          <AccountPanel session={session} onSession={onSession} />
        </main>
      </div>
    );
  }

  if (session?.user.locked) {
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
          <section className="card">
            <h2>🔒 Account Locked</h2>
            <p className="hint">
              Your subscription payment is pending, so this account is locked. Contact your administrator to renew —
              once payment is confirmed you'll get an activation code that unlocks the account instantly below.
            </p>
          </section>
          <AccountPanel session={session} onSession={onSession} />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🏗️</span>
          <div>
            <h1>Naija Build Estimator</h1>
            <p>Construction Cost & BOQ · Nigeria</p>
          </div>
          {pro && marketPrices && marketUpdatedAt && (
            <button
              className="price-bell"
              onClick={() => {
                setPricePopOpen((o) => !o);
                setPricesSeenAt(marketUpdatedAt);
                localStorage.setItem("nbe_prices_seen", marketUpdatedAt);
              }}
            >
              📈 Prices
              {pricesSeenAt !== marketUpdatedAt && <span className="dot" />}
            </button>
          )}
        </div>
        {pricePopOpen && pro && marketPrices && (
          <div className="price-pop">
            <h4>📈 Market prices — {state}</h4>
            <p className="pop-date">Updated {fmtDate(new Date(marketUpdatedAt!))}</p>
            <table>
              <tbody>
                {(Object.keys(PRICE_LABELS) as (keyof UnitPrices)[]).map((k) => (
                  <tr key={k}>
                    <td>{PRICE_LABELS[k]}</td>
                    <td className="num">{formatNaira(marketPrices[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </header>

      <main className="content">
        {tab === "estimate" && (
          <>
            {result && (
              <section className="total-card">
                <div className="total-label">Total Project Estimate</div>
                <div className="total-value">{convert(result.grandTotal)}</div>
                {result.contingency > 0 && (
                  <div className="total-meta">
                    incl. {convert(result.contingency)} contingency ({contingencyPct}%) · works {convert(result.total)}
                  </div>
                )}
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
                {marketUpdatedAt && !pricesLocked && (
                  <div className="total-meta">
                    📈 Market prices as of {new Date(marketUpdatedAt).toLocaleDateString("en-NG")}
                  </div>
                )}
                {pricesLocked && (
                  <div className="total-meta">
                    🔒 Using default prices — live market prices (updated{" "}
                    {marketUpdatedAt ? new Date(marketUpdatedAt).toLocaleDateString("en-NG") : "monthly"}) are a Pro
                    feature.{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setTab("account"); }}>Upgrade</a>
                  </div>
                )}
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
                      <option key={r.value} value={r.value}>
                        {r.label}{STATE_SOIL[state]?.foundation === r.value ? " ★ recommended" : ""}
                      </option>
                    ))}
                  </select>
                  {STATE_SOIL[state] && <small>{STATE_SOIL[state].note}</small>}
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
                  <select value={state} onChange={(e) => onSelectState(e.target.value)}>
                    {STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {STATE_SOIL[state] && <small>🧱 {STATE_SOIL[state].soil}</small>}
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
                  {BLOCK_OPTIONS.map((b) => (
                    <button
                      key={b.price}
                      className={blockPrice === b.price ? "active" : ""}
                      onClick={() => setBlockPrice(b.price)}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <small>Mould on-site: buy cement & sand and mould blocks at the site — usually the cheapest option.</small>
              </div>
            </section>

            <section className="card">
              <h2>🌍 Site Preparation & Utilities</h2>
              <p className="hint">Common Nigerian site add-ons — costed as lump sums on top of the build.</p>
              {SITE_ADDONS.map((a) => (
                <label key={a.key} className={`stage ${siteAddons.includes(a.key) ? "on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={siteAddons.includes(a.key)}
                    onChange={() => toggleAddon(a.key)}
                  />
                  <div>
                    <strong>{a.icon} {a.label}</strong>
                    <span>{a.hint}</span>
                  </div>
                </label>
              ))}
              <div className="field">
                <label>🏊 Swimming Pool</label>
                <select value={poolSize} onChange={(e) => setPoolSize(e.target.value)}>
                  {POOL_SIZES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <small>Reinforced concrete shell, tiling, pump & filtration — auto-suggested when a pool is on the uploaded plan.</small>
              </div>
              <div className="field">
                <label>Contingency / Inflation Buffer (%)</label>
                <input
                  type="number"
                  value={contingencyPct}
                  onChange={(e) => setContingencyPct(e.target.value)}
                  placeholder="10"
                />
                <small>Naira material prices move fast — 10–15% is typical for projects longer than 3 months.</small>
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
                <button
                  className="primary"
                  onClick={async () => {
                    if (!pro && session) {
                      try {
                        await consumeUsage(session, "export");
                      } catch (e) {
                        alert(e instanceof Error ? e.message : "Free plan limit reached — upgrade to Pro.");
                        setTab("account");
                        return;
                      }
                    }
                    exportEstimatePdf(input, result, projectName, {
                      companyName: pro ? branding.companyName : "",
                      companyPhone: pro ? branding.companyPhone : "",
                      companyLogo: pro ? branding.companyLogo : "",
                      pricesAsOf: marketUpdatedAt,
                      watermark: !pro,
                    });
                    if (!pro) setExportsUsed(recordUsage());
                  }}
                >
                  📄 Download PDF{!pro ? ` (${Math.max(FREE_MONTHLY_LIMIT - exportsUsed, 0)} free left)` : ""}
                </button>
                <button className="secondary" onClick={shareWhatsApp}>
                  💬 Share on WhatsApp
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
              <h3>🏷️ Your Branding (PDF & WhatsApp)</h3>
              <p className="hint">Shown on exported BOQ PDFs and shared estimates. Saved on this device.</p>
              <div className="field">
                <label>Company / Business Name</label>
                <input
                  value={branding.companyName}
                  onChange={(e) => setBranding((b) => ({ ...b, companyName: e.target.value }))}
                  placeholder="e.g. Adeyemi Construction Ltd"
                />
              </div>
              <div className="field">
                <label>Phone / WhatsApp</label>
                <input
                  value={branding.companyPhone}
                  onChange={(e) => setBranding((b) => ({ ...b, companyPhone: e.target.value }))}
                  placeholder="e.g. 0803 123 4567"
                />
              </div>
              <div className="field">
                <label>Company Logo (shown on PDF header)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const logo = await fileToLogoDataUrl(f);
                      setBranding((b) => ({ ...b, companyLogo: logo }));
                    } catch {
                      /* unreadable image — ignore */
                    }
                  }}
                />
                {branding.companyLogo && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
                    <img src={branding.companyLogo} alt="Company logo" style={{ height: 44, borderRadius: 6 }} />
                    <button className="secondary" onClick={() => setBranding((b) => ({ ...b, companyLogo: "" }))}>
                      Remove logo
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {tab === "prices" && <SuppliersDirectory session={session} pro={pro} />}

        {tab === "prices" && <AdminPanel settings={adminSettings} onChange={setAdminSettings} />}

        {tab === "account" && (
          <>
            <AccountPanel session={session} onSession={onSession} />
            {adminMode && (
              <SuperAdmin
                prices={prices}
                onPublished={(p, updatedAt) => {
                  setMarketPrices({ ...DEFAULT_PRICES, ...p });
                  setMarketUpdatedAt(updatedAt);
                }}
              />
            )}
          </>
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
        <button className={tab === "timeline" ? "on" : ""} onClick={() => setTab("timeline")}>
          📅<span>Timeline</span>
        </button>
        <button className={tab === "prices" ? "on" : ""} onClick={() => setTab("prices")}>
          ⚙️<span>Prices</span>
        </button>
        <button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>
          📚<span>History</span>
        </button>
        <button className={tab === "account" ? "on" : ""} onClick={() => setTab("account")}>
          👤<span>{pro ? "Pro ⭐" : "Account"}</span>
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
