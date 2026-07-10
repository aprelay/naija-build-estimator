import { bearerToken, EventContext, getUser, isPro, json, SupplierListing, verifyToken } from "../_lib";

// Directory of approved supplier listings — a Pro feature.

export async function onRequestGet(ctx: EventContext): Promise<Response> {
  const email = await verifyToken(ctx.env.ADMIN_KEY, bearerToken(ctx.request));
  if (!email) return json({ error: "Not logged in" }, 401);
  const user = await getUser(ctx.env.PRICES_KV, email);
  if (!user) return json({ error: "Account not found" }, 404);
  if (user.locked) return json({ error: "Account locked", locked: true }, 403);
  if (!isPro(user) && user.role !== "supplier")
    return json({ error: "Supplier directory is a Pro feature", proRequired: true }, 403);

  if (!ctx.env.PRICES_KV.list) return json({ suppliers: [] });
  const { keys } = await ctx.env.PRICES_KV.list({ prefix: "slisting:" });
  const suppliers: SupplierListing[] = [];
  for (const k of keys.slice(0, 200)) {
    const raw = await ctx.env.PRICES_KV.get(k.name);
    if (!raw) continue;
    const listing = JSON.parse(raw) as SupplierListing;
    const owner = await getUser(ctx.env.PRICES_KV, listing.email);
    if (!owner?.supplierApproved || owner.locked) continue;
    suppliers.push(listing);
  }
  suppliers.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return json({ suppliers });
}
