import { bearerToken, EventContext, getUser, isPro, JSON_HEADERS, json, verifyToken } from "../_lib";

const PRICE_KEYS = ["cement", "steel", "sand", "granite", "block", "roofingSheet"] as const;
const KV_KEY = "prices";

function kvKeyFor(state: string | null): string {
  if (!state) return KV_KEY;
  const clean = state.replace(/[^a-z ]/gi, "").trim();
  return clean ? `${KV_KEY}:${clean.toLowerCase()}` : KV_KEY;
}

export async function onRequestGet(ctx: EventContext): Promise<Response> {
  const state = new URL(ctx.request.url).searchParams.get("state");
  const stateKey = kvKeyFor(state);
  // Prefer state-specific prices, fall back to the national set.
  const stored =
    (stateKey !== KV_KEY ? await ctx.env.PRICES_KV.get(stateKey) : null) ??
    (await ctx.env.PRICES_KV.get(KV_KEY));
  if (!stored) {
    return json({ prices: null, updatedAt: null });
  }
  // Current market prices are a Pro feature: free users see when prices were
  // last published, but not the figures themselves.
  const email = await verifyToken(ctx.env.ADMIN_KEY, bearerToken(ctx.request));
  const user = email ? await getUser(ctx.env.PRICES_KV, email) : null;
  if (!isPro(user)) {
    const { updatedAt } = JSON.parse(stored) as { updatedAt: string | null };
    return json({ prices: null, updatedAt, locked: true });
  }
  return new Response(stored, { headers: JSON_HEADERS });
}

export async function onRequestPut(ctx: EventContext): Promise<Response> {
  const auth = ctx.request.headers.get("Authorization") || "";
  if (!ctx.env.ADMIN_KEY || auth !== `Bearer ${ctx.env.ADMIN_KEY}`) {
    return json({ error: "Unauthorized" }, 401);
  }
  let body: Record<string, unknown>;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const prices: Record<string, number> = {};
  for (const key of PRICE_KEYS) {
    const v = body[key];
    if (typeof v !== "number" || !isFinite(v) || v <= 0) {
      return json({ error: `Invalid or missing price: ${key}` }, 400);
    }
    prices[key] = v;
  }
  const state = new URL(ctx.request.url).searchParams.get("state");
  const payload = JSON.stringify({ prices, updatedAt: new Date().toISOString(), state: state || null });
  await ctx.env.PRICES_KV.put(kvKeyFor(state), payload);
  return new Response(payload, { headers: JSON_HEADERS });
}
