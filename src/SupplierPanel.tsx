import { useEffect, useState } from "react";
import type { AuthSession } from "./engine/auth";
import { formatNaira } from "./engine/estimate";

interface Item {
  material: string;
  unit: string;
  price: number;
}

interface Props {
  session: AuthSession;
}

const SUGGESTED: Item[] = [
  { material: "Cement (Dangote)", unit: "bag", price: 0 },
  { material: "Sharp sand", unit: "20-tonne trip", price: 0 },
  { material: "Granite", unit: "30-tonne trip", price: 0 },
  { material: "9-inch block", unit: "piece", price: 0 },
  { material: "Reinforcement steel (16mm)", unit: "tonne", price: 0 },
  { material: "Roofing sheet (0.55mm)", unit: "m²", price: 0 },
];

export default function SupplierPanel({ session }: Props) {
  const [items, setItems] = useState<Item[]>(SUGGESTED);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const approved = !!session.user.supplierApproved;
  const profile = session.user.supplierProfile;

  useEffect(() => {
    fetch("/api/supplier/listing", { headers: { Authorization: `Bearer ${session.token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { listing: { items: Item[]; updatedAt: string } | null } | null) => {
        if (d?.listing) {
          setItems(d.listing.items);
          setUpdatedAt(d.listing.updatedAt);
        }
      })
      .catch(() => {});
  }, [session.token]);

  function setItem(i: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function save() {
    setBusy(true);
    setStatus("Publishing…");
    try {
      const res = await fetch("/api/supplier/listing", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ items: items.filter((it) => it.material && it.price > 0) }),
      });
      const data = (await res.json().catch(() => ({}))) as { listing?: { updatedAt: string }; error?: string };
      if (!res.ok || !data.listing) {
        setStatus(`Failed: ${data.error ?? res.status}`);
        return;
      }
      setUpdatedAt(data.listing.updatedAt);
      setStatus("Published — Pro developers can now see today's prices. ✅");
    } catch {
      setStatus("Failed: network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>🏪 Supplier Dashboard</h2>
      {profile && (
        <p className="hint">
          <strong>{profile.businessName}</strong> · {profile.state} · WhatsApp {profile.whatsapp}
        </p>
      )}
      {!approved && (
        <p className="hint">
          ⏳ Your supplier account is awaiting approval by the administrator. Once approved, prices you publish here
          appear in the marketplace that Pro developers and builders see.
        </p>
      )}
      {approved && (
        <>
          <p className="hint">
            Post today's prices — they appear instantly to Pro developers and builders with your WhatsApp contact.
            Update them daily to stay at the top of the marketplace.
            {updatedAt && ` Last published: ${new Date(updatedAt).toLocaleString("en-NG")}.`}
          </p>
          <table className="trades">
            <thead>
              <tr><th>Material</th><th>Unit</th><th>Price (₦)</th></tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td><input value={it.material} onChange={(e) => setItem(i, { material: e.target.value })} /></td>
                  <td><input value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} /></td>
                  <td>
                    <input
                      type="number"
                      value={it.price || ""}
                      onChange={(e) => setItem(i, { price: +e.target.value })}
                      placeholder="0"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="secondary"
            onClick={() => setItems((prev) => [...prev, { material: "", unit: "", price: 0 }])}
          >
            + Add material
          </button>
          <button className="primary" onClick={save} disabled={busy} style={{ marginLeft: 8 }}>
            📢 Publish today's prices
          </button>
          {items.some((it) => it.price > 0) && (
            <p className="hint">
              Preview: {items.filter((it) => it.price > 0).map((it) => `${it.material} ${formatNaira(it.price)}`).join(" · ")}
            </p>
          )}
        </>
      )}
      {status && <p className="hint">{status}</p>}
    </section>
  );
}
