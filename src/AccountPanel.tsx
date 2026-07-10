import { useState } from "react";
import {
  FREE_MONTHLY_LIMIT,
  isProSession,
  login,
  monthlyUsage,
  redeemCode,
  signup,
} from "./engine/auth";
import type { AuthSession } from "./engine/auth";
import { STATES } from "./engine/data";

interface Props {
  session: AuthSession | null;
  onSession: (s: AuthSession | null) => void;
}

export default function AccountPanel({ session, onSession }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountType, setAccountType] = useState<"builder" | "supplier">("builder");
  const [businessName, setBusinessName] = useState("");
  const [supplierState, setSupplierState] = useState("Lagos");
  const [whatsapp, setWhatsapp] = useState("");

  const pro = isProSession(session);
  const used = monthlyUsage();

  async function submit() {
    setBusy(true);
    setStatus("");
    try {
      const s =
        mode === "signup"
          ? await signup(
              email,
              password,
              accountType === "supplier"
                ? { businessName, state: supplierState, whatsapp }
                : undefined,
            )
          : await login(email, password);
      onSession(s);
      setPassword("");
      setStatus(mode === "signup" ? "Account created — you're logged in." : "Logged in.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    if (!session) return;
    setBusy(true);
    setStatus("");
    try {
      const user = await redeemCode(session, code);
      onSession({ ...session, user });
      setCode("");
      setStatus("Code accepted — Pro is active. 🎉");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>👤 Account & Plan</h2>
      {!session && (
        <>
          <p className="hint">
            Free plan: {FREE_MONTHLY_LIMIT} PDF exports/month (watermarked), default prices. Pro unlocks unlimited
            branded exports and live monthly market prices per state.
          </p>
          <div className="block-toggle">
            <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
              Create account
            </button>
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
              Log in
            </button>
          </div>
          {mode === "signup" && (
            <div className="field">
              <label>Account type</label>
              <select value={accountType} onChange={(e) => setAccountType(e.target.value as "builder" | "supplier")}>
                <option value="builder">🏗️ Developer / Builder</option>
                <option value="supplier">🏪 Materials Supplier</option>
              </select>
              {accountType === "supplier" && (
                <small>Suppliers post daily material prices; approved listings are shown to Pro developers.</small>
              )}
            </div>
          )}
          {mode === "signup" && accountType === "supplier" && (
            <>
              <div className="field">
                <label>Business name</label>
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Mama B Building Materials" />
              </div>
              <div className="grid2">
                <div className="field">
                  <label>State</label>
                  <select value={supplierState} onChange={(e) => setSupplierState(e.target.value)}>
                    {STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>WhatsApp number</label>
                  <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="e.g. 08031234567" />
                </div>
              </div>
            </>
          )}
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          <button
            className="primary"
            onClick={submit}
            disabled={
              busy || !email || !password || (mode === "signup" && accountType === "supplier" && (!businessName || !whatsapp))
            }
          >
            {mode === "signup" ? "Create account" : "Log in"}
          </button>
        </>
      )}
      {session && (
        <>
          <p className="hint">
            Logged in as <strong>{session.user.email}</strong>
            {session.user.role === "supplier" ? (
              <>
                {" "}· <strong>🏪 Supplier{session.user.supplierApproved ? " ✓ approved" : " (awaiting approval)"}</strong>
              </>
            ) : (
              <>
                {" "}· Plan: <strong>{pro ? "Pro ⭐" : "Free"}</strong>
                {pro && session.user.proUntil && ` (until ${new Date(session.user.proUntil).toLocaleDateString("en-NG")})`}
              </>
            )}
          </p>
          {!pro && session.user.role !== "supplier" && (
            <p className="hint">
              {used}/{FREE_MONTHLY_LIMIT} free PDF exports used this month. Upgrade to Pro for unlimited branded
              exports and live market prices — pay by bank transfer, then enter the activation code you receive.
            </p>
          )}
          <div className="field">
            <label>Activation code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="NBE-XXXX-XXXX-XXXX" />
          </div>
          <button className="primary" onClick={redeem} disabled={busy || !code}>
            🎟️ Redeem code
          </button>
          <button className="secondary" onClick={() => onSession(null)} style={{ marginLeft: 8 }}>
            Log out
          </button>
        </>
      )}
      {status && <p className="hint">{status}</p>}
    </section>
  );
}
