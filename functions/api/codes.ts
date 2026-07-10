import { CodeRecord, EventContext, json, randomHex } from "../_lib";

function isAdmin(ctx: EventContext): boolean {
  const auth = ctx.request.headers.get("Authorization") || "";
  return !!ctx.env.ADMIN_KEY && auth === `Bearer ${ctx.env.ADMIN_KEY}`;
}

// Generate activation codes (admin only): { months, count } -> { codes: [...] }
export async function onRequestPost(ctx: EventContext): Promise<Response> {
  if (!isAdmin(ctx)) return json({ error: "Unauthorized" }, 401);
  let body: { months?: unknown; count?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const months = typeof body.months === "number" && body.months >= 1 && body.months <= 36 ? Math.round(body.months) : 0;
  const count = typeof body.count === "number" && body.count >= 1 && body.count <= 50 ? Math.round(body.count) : 1;
  if (!months) return json({ error: "months must be 1–36" }, 400);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = `NBE-${randomHex(2).toUpperCase()}-${randomHex(2).toUpperCase()}-${randomHex(2).toUpperCase()}`;
    const rec: CodeRecord = { months, createdAt: new Date().toISOString(), usedBy: null, usedAt: null };
    await ctx.env.PRICES_KV.put(`code:${code}`, JSON.stringify(rec));
    codes.push(code);
  }
  return json({ codes, months });
}

// List issued codes and their status (admin only).
export async function onRequestGet(ctx: EventContext): Promise<Response> {
  if (!isAdmin(ctx)) return json({ error: "Unauthorized" }, 401);
  if (!ctx.env.PRICES_KV.list) return json({ codes: [] });
  const { keys } = await ctx.env.PRICES_KV.list({ prefix: "code:" });
  const codes = [];
  for (const k of keys.slice(0, 200)) {
    const raw = await ctx.env.PRICES_KV.get(k.name);
    if (raw) codes.push({ code: k.name.slice(5), ...(JSON.parse(raw) as CodeRecord) });
  }
  codes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return json({ codes });
}
