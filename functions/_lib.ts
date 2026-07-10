// Shared helpers for Pages Functions: KV types, password hashing, signed tokens.

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete?(key: string): Promise<void>;
  list?(opts: { prefix: string }): Promise<{ keys: { name: string }[] }>;
}

export interface Env {
  PRICES_KV: KVNamespace;
  ADMIN_KEY: string;
}

export interface EventContext {
  request: Request;
  env: Env;
}

export interface UserRecord {
  email: string;
  salt: string;
  hash: string;
  proUntil: string | null;
  createdAt: string;
  locked?: boolean;
  role?: "supplier";
  supplierApproved?: boolean;
  supplierProfile?: SupplierProfile;
}

export interface SupplierProfile {
  businessName: string;
  state: string;
  whatsapp: string;
}

export interface SupplierListing extends SupplierProfile {
  email: string;
  items: { material: string; unit: string; price: number }[];
  updatedAt: string;
}

export interface CodeRecord {
  months: number;
  createdAt: string;
  usedBy: string | null;
  usedAt: string | null;
}

export const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`${salt}:${password}`));
  return toHex(digest);
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

export async function signToken(secret: string, email: string, days = 90): Promise<string> {
  const exp = Date.now() + days * 86400000;
  const payload = btoa(`${email}|${exp}`);
  return `${payload}.${await hmac(secret, payload)}`;
}

/** Returns the email if the token is valid and unexpired, otherwise null. */
export async function verifyToken(secret: string, token: string | null): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if ((await hmac(secret, payload)) !== sig) return null;
  try {
    const [email, exp] = atob(payload).split("|");
    if (!email || Date.now() > +exp) return null;
    return email;
  } catch {
    return null;
  }
}

export function bearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

export function normEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export async function getUser(kv: KVNamespace, email: string): Promise<UserRecord | null> {
  const raw = await kv.get(`user:${email}`);
  return raw ? (JSON.parse(raw) as UserRecord) : null;
}

export function isPro(user: UserRecord | null): boolean {
  return !!user?.proUntil && new Date(user.proUntil).getTime() > Date.now();
}

export function publicProfile(user: UserRecord) {
  return {
    email: user.email,
    plan: isPro(user) ? "pro" : "free",
    proUntil: user.proUntil,
    locked: !!user.locked,
    role: user.role ?? null,
    supplierApproved: !!user.supplierApproved,
    supplierProfile: user.supplierProfile ?? null,
  };
}

export function isAdminRequest(ctx: EventContext): boolean {
  const auth = ctx.request.headers.get("Authorization") || "";
  return !!ctx.env.ADMIN_KEY && auth === `Bearer ${ctx.env.ADMIN_KEY}`;
}
