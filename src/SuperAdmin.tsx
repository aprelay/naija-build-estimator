import { useState } from "react";
import { STATES } from "./engine/data";
import type { UnitPrices } from "./engine/data";

interface AdminUser {
  email: string;
  plan: "free" | "pro";
  proUntil: string | null;
  locked: boolean;
  createdAt: string;
  role: "supplier" | null;
  supplierApproved: boolean;
  supplierProfile: { businessName: string; state: string; whatsapp: string } | null;
}

interface IssuedCode {
  code: string;
  months: number;
  usedBy: string | null;
}

interface Props {
  prices: UnitPrices;
  onPublished: (prices: UnitPrices, updatedAt: string) => void;
}

export default function SuperAdmin({ prices, onPublished }: Props) {
  const [adminKey, setAdminKey] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [status, setStatus] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [codes, setCodes] = useState<IssuedCode[]>([]);
  const [codeMonths, setCodeMonths] = useState(1);
  const [codeCount, setCodeCount] = useState(1);
  const [extendMonths, setExtendMonths] = useState(1);
  const [publishState, setPublishState] = useState("");
  const [publishStatus, setPublishStatus] = useState("");

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${adminKey}` };

  async function loadUsers(): Promise<boolean> {
    const res = await fetch("/api/admin/users", { headers });
    const data = (await res.json().catch(() => ({}))) as { users?: AdminUser[]; error?: string };
    if (!res.ok || !data.users) {
      setStatus(`Failed: ${data.error ?? res.status}`);
      return false;
    }
    setUsers(data.users);
    return true;
  }

  async function enter() {
    setStatus("Checking key…");
    try {
      if (await loadUsers()) {
        setUnlocked(true);
        setStatus("");
      }
    } catch {
      setStatus("Failed: network error");
    }
  }

  async function userAction(
    email: string,
    action: "lock" | "unlock" | "extend" | "approve_supplier" | "revoke_supplier" | "delete",
  ) {
    if (action === "delete" && !confirm(`Permanently delete ${email} and all their data? This cannot be undone.`)) return;
    setStatus("Working…");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify({ email, action, ...(action === "extend" ? { months: extendMonths } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus(`Failed: ${data.error ?? res.status}`);
        return;
      }
      await loadUsers();
      setStatus(
        `Done — ${email} ${
          action === "extend"
            ? `extended ${extendMonths} month(s)`
            : action === "delete"
              ? "deleted permanently"
              : action === "approve_supplier"
              ? "approved as supplier"
              : action === "revoke_supplier"
                ? "supplier approval revoked"
                : `${action}ed`
        }.`,
      );
    } catch {
      setStatus("Failed: network error");
    }
  }

  async function generateCodes() {
    setStatus("Generating…");
    try {
      const res = await fetch("/api/codes", {
        method: "POST",
        headers,
        body: JSON.stringify({ months: codeMonths, count: codeCount }),
      });
      const data = (await res.json().catch(() => ({}))) as { codes?: string[]; error?: string };
      if (!res.ok || !data.codes) {
        setStatus(`Failed: ${data.error ?? res.status}`);
        return;
      }
      setCodes((prev) => [...data.codes!.map((code) => ({ code, months: codeMonths, usedBy: null })), ...prev]);
      setStatus(`Generated ${data.codes.length} code(s) — send after payment is confirmed.`);
    } catch {
      setStatus("Failed: network error");
    }
  }

  async function listCodes() {
    setStatus("Loading…");
    try {
      const res = await fetch("/api/codes", { headers });
      const data = (await res.json().catch(() => ({}))) as { codes?: IssuedCode[]; error?: string };
      if (!res.ok || !data.codes) {
        setStatus(`Failed: ${data.error ?? res.status}`);
        return;
      }
      setCodes(data.codes);
      setStatus(`${data.codes.length} code(s) issued.`);
    } catch {
      setStatus("Failed: network error");
    }
  }

  async function publishPrices() {
    setPublishStatus("Publishing…");
    try {
      const url = publishState ? `/api/prices?state=${encodeURIComponent(publishState)}` : "/api/prices";
      const res = await fetch(url, { method: "PUT", headers, body: JSON.stringify(prices) });
      const data = (await res.json().catch(() => ({}))) as { prices?: UnitPrices; updatedAt?: string; error?: string };
      if (!res.ok || !data.prices) {
        setPublishStatus(`Failed: ${data.error ?? res.status}`);
        return;
      }
      onPublished(data.prices, data.updatedAt!);
      setPublishStatus(
        publishState
          ? `Published for ${publishState} — Pro users in ${publishState} now see these prices.`
          : "Published — all Pro users now see these prices (national default).",
      );
    } catch {
      setPublishStatus("Failed: network error");
    }
  }

  if (!unlocked) {
    return (
      <section className="card">
        <h2>🛡️ Superadmin</h2>
        <p className="hint">Enter the admin key to manage users, activation codes and market prices.</p>
        <div className="field">
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Admin key"
          />
        </div>
        {status && <p className="hint">{status}</p>}
        <button className="primary" onClick={enter} disabled={!adminKey}>
          Unlock superadmin
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <h2>👥 Users ({users.length})</h2>
        <div className="field">
          <label>Months for “Extend”</label>
          <input
            type="number"
            value={extendMonths}
            min={1}
            max={36}
            onChange={(e) => setExtendMonths(Math.max(1, +e.target.value))}
          />
        </div>
        <table className="trades">
          <thead>
            <tr><th>Email</th><th>Plan</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email}>
                <td>
                  {u.email}
                  {u.role === "supplier" && u.supplierProfile && (
                    <div className="hint" style={{ margin: 0 }}>
                      🏪 {u.supplierProfile.businessName} · {u.supplierProfile.state} · {u.supplierProfile.whatsapp}
                    </div>
                  )}
                </td>
                <td>
                  {u.role === "supplier" ? (
                    <>Supplier {u.supplierApproved ? "✓" : "(pending)"}</>
                  ) : (
                    <>
                      {u.plan === "pro" ? "Pro ⭐" : "Free"}
                      {u.proUntil && ` (until ${new Date(u.proUntil).toLocaleDateString("en-NG")})`}
                    </>
                  )}
                </td>
                <td>{u.locked ? "🔒 Locked" : "Active"}</td>
                <td>
                  {u.locked ? (
                    <button className="secondary" onClick={() => userAction(u.email, "unlock")}>Unlock</button>
                  ) : (
                    <button className="secondary" onClick={() => userAction(u.email, "lock")}>Lock</button>
                  )}{" "}
                  {u.role === "supplier" ? (
                    u.supplierApproved ? (
                      <button className="secondary" onClick={() => userAction(u.email, "revoke_supplier")}>Revoke</button>
                    ) : (
                      <button className="secondary" onClick={() => userAction(u.email, "approve_supplier")}>Approve</button>
                    )
                  ) : (
                    <button className="secondary" onClick={() => userAction(u.email, "extend")}>Extend</button>
                  )}{" "}
                  <button className="danger" onClick={() => userAction(u.email, "delete")}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="secondary" onClick={loadUsers}>↻ Refresh</button>
        {status && <p className="hint">{status}</p>}
      </section>

      <section className="card">
        <h2>🔑 Pro Activation Codes</h2>
        <p className="hint">
          Invoice the client, receive the bank transfer, then generate a one-time code and send it to them. Redeeming
          it in their Account tab activates Pro for the months you choose.
        </p>
        <div className="grid2">
          <div className="field">
            <label>Months of Pro</label>
            <input type="number" value={codeMonths} min={1} max={36} onChange={(e) => setCodeMonths(Math.max(1, +e.target.value))} />
          </div>
          <div className="field">
            <label>How many codes</label>
            <input type="number" value={codeCount} min={1} max={50} onChange={(e) => setCodeCount(Math.max(1, +e.target.value))} />
          </div>
        </div>
        <button className="primary" onClick={generateCodes}>Generate</button>
        <button className="secondary" onClick={listCodes} style={{ marginLeft: 8 }}>View issued codes</button>
        {codes.length > 0 && (
          <table className="trades">
            <thead>
              <tr><th>Code</th><th>Months</th><th>Status</th></tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.code}>
                  <td>{c.code}</td>
                  <td>{c.months}</td>
                  <td>{c.usedBy ? `Used by ${c.usedBy}` : "Unused"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>📢 Publish Market Prices</h2>
        <p className="hint">
          Publishes the unit prices currently set in your Prices tab as the market prices Pro users receive.
        </p>
        <div className="field">
          <label>Publish scope</label>
          <select value={publishState} onChange={(e) => setPublishState(e.target.value)}>
            <option value="">🇳🇬 National (all states)</option>
            {STATES.map((s) => (
              <option key={s} value={s}>{s} only</option>
            ))}
          </select>
          <small>State-specific prices override the national set for users in that state.</small>
        </div>
        <button className="primary" onClick={publishPrices}>📢 Publish</button>
        {publishStatus && <p className="hint">{publishStatus}</p>}
      </section>
    </>
  );
}
