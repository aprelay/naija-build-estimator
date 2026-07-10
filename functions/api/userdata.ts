import { bearerToken, EventContext, getUser, json, verifyToken } from "../_lib";

// Per-account cloud storage for the user's own dashboard (prices, branding,
// history, settings). Each account's data lives under its own key — never
// shared between users.

const MAX_BYTES = 800_000;

export async function onRequestGet(ctx: EventContext): Promise<Response> {
  const email = await verifyToken(ctx.env.ADMIN_KEY, bearerToken(ctx.request));
  if (!email) return json({ error: "Not logged in" }, 401);
  const raw = await ctx.env.PRICES_KV.get(`udata:${email}`);
  return json({ data: raw ? JSON.parse(raw) : null });
}

export async function onRequestPut(ctx: EventContext): Promise<Response> {
  const email = await verifyToken(ctx.env.ADMIN_KEY, bearerToken(ctx.request));
  if (!email) return json({ error: "Not logged in" }, 401);
  const user = await getUser(ctx.env.PRICES_KV, email);
  if (!user) return json({ error: "Account not found" }, 404);
  if (user.locked) return json({ error: "Account locked — contact your administrator", locked: true }, 403);
  const body = await ctx.request.text();
  if (body.length > MAX_BYTES) return json({ error: "Data too large" }, 413);
  try {
    JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  await ctx.env.PRICES_KV.put(`udata:${email}`, body);
  return json({ ok: true });
}
