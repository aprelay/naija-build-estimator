// Client-side auth/session + free-tier usage tracking.

export interface SupplierProfile {
  businessName: string;
  state: string;
  whatsapp: string;
}

export interface AuthUser {
  email: string;
  plan: "free" | "pro";
  proUntil: string | null;
  locked?: boolean;
  role?: "supplier" | null;
  supplierApproved?: boolean;
  supplierProfile?: SupplierProfile | null;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

const AUTH_KEY = "nbe_auth";
const USAGE_KEY = "nbe_usage";

export const FREE_MONTHLY_LIMIT = 3;

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: AuthSession | null) {
  if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s));
  else localStorage.removeItem(AUTH_KEY);
}

export function isProSession(s: AuthSession | null): boolean {
  return s?.user.plan === "pro" && !!s.user.proUntil && new Date(s.user.proUntil).getTime() > Date.now();
}

interface Usage {
  month: string;
  count: number;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function monthlyUsage(): number {
  try {
    const u = JSON.parse(localStorage.getItem(USAGE_KEY) || "null") as Usage | null;
    return u && u.month === currentMonth() ? u.count : 0;
  } catch {
    return 0;
  }
}

export function recordUsage(): number {
  const next: Usage = { month: currentMonth(), count: monthlyUsage() + 1 };
  localStorage.setItem(USAGE_KEY, JSON.stringify(next));
  return next.count;
}

async function post(url: string, body: unknown, token?: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) || `Request failed (${res.status})`);
  return data;
}

export async function signup(
  email: string,
  password: string,
  supplier?: SupplierProfile,
): Promise<AuthSession> {
  const data = await post("/api/auth/signup", {
    email,
    password,
    ...(supplier ? { role: "supplier", ...supplier } : {}),
  });
  return { token: data.token as string, user: data.user as AuthUser };
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const data = await post("/api/auth/login", { email, password });
  return { token: data.token as string, user: data.user as AuthUser };
}

export async function redeemCode(session: AuthSession, code: string): Promise<AuthUser> {
  const data = await post("/api/redeem", { code }, session.token);
  return data.user as AuthUser;
}

export async function refreshMe(session: AuthSession): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${session.token}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: AuthUser };
    return data.user;
  } catch {
    return null;
  }
}
