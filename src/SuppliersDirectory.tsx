import { useEffect, useState } from "react";
import type { AuthSession } from "./engine/auth";
import { formatNaira } from "./engine/estimate";
import { STATES } from "./engine/data";

interface Listing {
  email: string;
  businessName: string;
  state: string;
  whatsapp: string;
  items: { material: string; unit: string; price: number }[];
  updatedAt: string;
}

interface Props {
  session: AuthSession;
  pro: boolean;
}

export default function SuppliersDirectory({ session, pro }: Props) {
  const [suppliers, setSuppliers] = useState<Listing[]>([]);
  const [stateFilter, setStateFilter] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!pro) return;
    fetch("/api/suppliers", { headers: { Authorization: `Bearer ${session.token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { suppliers: Listing[] } | null) => {
        if (d?.suppliers) setSuppliers(d.suppliers);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [session.token, pro]);

  if (!pro) {
    return (
      <section className="card">
        <h2>🏪 Supplier Marketplace</h2>
        <p className="hint">
          🔒 The supplier marketplace is a Pro feature — see daily prices from verified suppliers across Nigeria and
          contact them directly on WhatsApp. Upgrade in the Account tab.
        </p>
      </section>
    );
  }

  const shown = stateFilter ? suppliers.filter((s) => s.state === stateFilter) : suppliers;

  return (
    <section className="card">
      <h2>🏪 Supplier Marketplace</h2>
      <p className="hint">
        Daily prices from verified suppliers — freshest first. Contact them directly on WhatsApp to order.
      </p>
      <div className="field">
        <label>Filter by state</label>
        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
          <option value="">All states</option>
          {STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      {loaded && shown.length === 0 && (
        <p className="hint">No supplier listings{stateFilter ? ` in ${stateFilter}` : ""} yet — check back soon.</p>
      )}
      {shown.map((s) => (
        <div className="supplier-card" key={s.email}>
          <div className="supplier-head">
            <div>
              <strong>{s.businessName}</strong>
              <div className="supplier-meta">
                📍 {s.state} · Updated {new Date(s.updatedAt).toLocaleDateString("en-NG")}
              </div>
            </div>
            <a
              className="wa-btn"
              href={`https://wa.me/${s.whatsapp.replace(/\D/g, "").replace(/^0/, "234")}?text=${encodeURIComponent(
                `Hello ${s.businessName}, I saw your prices on Naija Build Estimator and I'd like to make an enquiry.`,
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              💬 Contact on WhatsApp
            </a>
          </div>
          <table className="trades">
            <tbody>
              {s.items.map((it, i) => (
                <tr key={i}>
                  <td>{it.material}</td>
                  <td>{it.unit}</td>
                  <td className="num">{formatNaira(it.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
