interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface Env {
  PRICES_KV: KVNamespace;
  ADMIN_KEY: string;
}

interface EventContext {
  request: Request;
  env: Env;
}

const PRICE_KEYS = ["cement", "steel", "sand", "granite", "block", "roofingSheet"] as const;
const KV_KEY = "prices";

function kvKeyFor(state: string | null): string {
  if (!state) return KV_KEY;
  const clean = state.replace(/[^a-z ]/gi, "").trim();
  return clean ? `${KV_KEY}:${clean.toLowerCase()}` : KV_KEY;
}

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export async function onRequestGet(ctx: EventContext): Promise<Response> {
  const state = new URL(ctx.request.url).searchParams.get("state");
  const stateKey = kvKeyFor(state);
  // Prefer state-specific prices, fall back to the national set.
  const stored =
    (stateKey !== KV_KEY ? await ctx.env.PRICES_KV.get(stateKey) : null) ??
    (await ctx.env.PRICES_KV.get(KV_KEY));
  if (!stored) {
    return new Response(JSON.stringify({ prices: null, updatedAt: null }), { headers: JSON_HEADERS });
  }
  return new Response(stored, { headers: JSON_HEADERS });
}

export async function onRequestPut(ctx: EventContext): Promise<Response> {
  const auth = ctx.request.headers.get("Authorization") || "";
  if (!ctx.env.ADMIN_KEY || auth !== `Bearer ${ctx.env.ADMIN_KEY}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }
  let body: Record<string, unknown>;
  try {
    body = await ctx.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: JSON_HEADERS });
  }
  const prices: Record<string, number> = {};
  for (const key of PRICE_KEYS) {
    const v = body[key];
    if (typeof v !== "number" || !isFinite(v) || v <= 0) {
      return new Response(JSON.stringify({ error: `Invalid or missing price: ${key}` }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
    prices[key] = v;
  }
  const state = new URL(ctx.request.url).searchParams.get("state");
  const payload = JSON.stringify({ prices, updatedAt: new Date().toISOString(), state: state || null });
  await ctx.env.PRICES_KV.put(kvKeyFor(state), payload);
  return new Response(payload, { headers: JSON_HEADERS });
}
