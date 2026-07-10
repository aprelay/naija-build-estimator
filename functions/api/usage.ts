import { bearerToken, EventContext, getUser, isPro, json, verifyToken } from "../_lib";

// Server-side monthly usage limits for free accounts. Pro accounts are unlimited.

export const FREE_LIMITS: Record<string, number> = {
  export: 3,
  upload: 2,
};

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function onRequestGet(ctx: EventContext): Promise<Response> {
  const email = await verifyToken(ctx.env.ADMIN_KEY, bearerToken(ctx.request));
  if (!email) return json({ error: "Not logged in" }, 401);
  const raw = await ctx.env.PRICES_KV.get(`usage:${email}:${monthKey()}`);
  const usage = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  return json({ usage, limits: FREE_LIMITS });
}

export async function onRequestPost(ctx: EventContext): Promise<Response> {
  const email = await verifyToken(ctx.env.ADMIN_KEY, bearerToken(ctx.request));
  if (!email) return json({ error: "Not logged in" }, 401);
  const user = await getUser(ctx.env.PRICES_KV, email);
  if (!user) return json({ error: "Account not found" }, 404);
  if (user.locked) return json({ error: "Account locked", locked: true }, 403);

  let body: { kind?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const kind = typeof body.kind === "string" && body.kind in FREE_LIMITS ? body.kind : "";
  if (!kind) return json({ error: "kind must be one of: " + Object.keys(FREE_LIMITS).join(", ") }, 400);

  if (isPro(user)) return json({ ok: true, unlimited: true });

  const key = `usage:${email}:${monthKey()}`;
  const raw = await ctx.env.PRICES_KV.get(key);
  const usage = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  const used = usage[kind] ?? 0;
  const limit = FREE_LIMITS[kind];
  if (used >= limit)
    return json(
      { error: `Free plan limit reached (${limit}/${limit} ${kind}s this month) — upgrade to Pro for unlimited use.`, limitReached: true, used, limit },
      403,
    );
  usage[kind] = used + 1;
  await ctx.env.PRICES_KV.put(key, JSON.stringify(usage));
  return json({ ok: true, used: usage[kind], limit });
}
