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

  const pro = isProSession(session);
  const used = monthlyUsage();

  async function submit() {
    setBusy(true);
    setStatus("");
    try {
      const s = mode === "signup" ? await signup(email, password) : await login(email, password);
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
          <button className="primary" onClick={submit} disabled={busy || !email || !password}>
            {mode === "signup" ? "Create account" : "Log in"}
          </button>
        </>
      )}
      {session && (
        <>
          <p className="hint">
            Logged in as <strong>{session.user.email}</strong> · Plan:{" "}
            <strong>{pro ? "Pro ⭐" : "Free"}</strong>
            {pro && session.user.proUntil && ` (until ${new Date(session.user.proUntil).toLocaleDateString("en-NG")})`}
          </p>
          {!pro && (
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
