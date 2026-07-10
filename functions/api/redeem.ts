import { bearerToken, CodeRecord, EventContext, getUser, json, publicProfile, verifyToken } from "../_lib";

export async function onRequestPost(ctx: EventContext): Promise<Response> {
  const email = await verifyToken(ctx.env.ADMIN_KEY, bearerToken(ctx.request));
  if (!email) return json({ error: "Log in first to redeem a code" }, 401);
  const user = await getUser(ctx.env.PRICES_KV, email);
  if (!user) return json({ error: "Account not found" }, 404);
  let body: { code?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) return json({ error: "Enter an activation code" }, 400);
  const raw = await ctx.env.PRICES_KV.get(`code:${code}`);
  if (!raw) return json({ error: "Invalid activation code" }, 404);
  const rec = JSON.parse(raw) as CodeRecord;
  if (rec.usedBy) return json({ error: "This code has already been used" }, 409);

  const base = user.proUntil && new Date(user.proUntil).getTime() > Date.now() ? new Date(user.proUntil) : new Date();
  base.setMonth(base.getMonth() + rec.months);
  user.proUntil = base.toISOString();
  user.locked = false;
  rec.usedBy = email;
  rec.usedAt = new Date().toISOString();
  await ctx.env.PRICES_KV.put(`user:${email}`, JSON.stringify(user));
  await ctx.env.PRICES_KV.put(`code:${code}`, JSON.stringify(rec));
  return json({ user: publicProfile(user), months: rec.months });
}
