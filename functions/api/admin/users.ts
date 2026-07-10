import { EventContext, getUser, isAdminRequest, json, normEmail, publicProfile, UserRecord } from "../../_lib";

// Superadmin: list all user accounts.
export async function onRequestGet(ctx: EventContext): Promise<Response> {
  if (!isAdminRequest(ctx)) return json({ error: "Unauthorized" }, 401);
  if (!ctx.env.PRICES_KV.list) return json({ users: [] });
  const { keys } = await ctx.env.PRICES_KV.list({ prefix: "user:" });
  const users = [];
  for (const k of keys.slice(0, 500)) {
    const raw = await ctx.env.PRICES_KV.get(k.name);
    if (!raw) continue;
    const u = JSON.parse(raw) as UserRecord;
    users.push({ ...publicProfile(u), createdAt: u.createdAt });
  }
  users.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return json({ users });
}

// Superadmin: lock / unlock / extend a user.
export async function onRequestPost(ctx: EventContext): Promise<Response> {
  if (!isAdminRequest(ctx)) return json({ error: "Unauthorized" }, 401);
  let body: { email?: unknown; action?: unknown; months?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const email = normEmail(body.email);
  const action = typeof body.action === "string" ? body.action : "";
  if (!email) return json({ error: "Invalid email" }, 400);
  const user = await getUser(ctx.env.PRICES_KV, email);
  if (!user) return json({ error: "User not found" }, 404);

  if (action === "lock") user.locked = true;
  else if (action === "unlock") user.locked = false;
  else if (action === "approve_supplier" || action === "revoke_supplier") {
    if (user.role !== "supplier") return json({ error: "Not a supplier account" }, 400);
    user.supplierApproved = action === "approve_supplier";
  } else if (action === "extend") {
    const months = typeof body.months === "number" && body.months >= 1 && body.months <= 36 ? Math.round(body.months) : 0;
    if (!months) return json({ error: "months must be 1–36" }, 400);
    const base = user.proUntil && new Date(user.proUntil).getTime() > Date.now() ? new Date(user.proUntil) : new Date();
    base.setMonth(base.getMonth() + months);
    user.proUntil = base.toISOString();
    user.locked = false;
  } else return json({ error: "Unknown action" }, 400);

  await ctx.env.PRICES_KV.put(`user:${email}`, JSON.stringify(user));
  return json({ user: { ...publicProfile(user), createdAt: user.createdAt } });
}
