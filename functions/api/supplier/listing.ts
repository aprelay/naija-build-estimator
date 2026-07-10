import { bearerToken, EventContext, getUser, json, SupplierListing, verifyToken } from "../../_lib";

// A supplier's own daily price listing. Stored under slisting:{email}.

const MAX_ITEMS = 40;

export async function onRequestGet(ctx: EventContext): Promise<Response> {
  const email = await verifyToken(ctx.env.ADMIN_KEY, bearerToken(ctx.request));
  if (!email) return json({ error: "Not logged in" }, 401);
  const raw = await ctx.env.PRICES_KV.get(`slisting:${email}`);
  return json({ listing: raw ? (JSON.parse(raw) as SupplierListing) : null });
}

export async function onRequestPut(ctx: EventContext): Promise<Response> {
  const email = await verifyToken(ctx.env.ADMIN_KEY, bearerToken(ctx.request));
  if (!email) return json({ error: "Not logged in" }, 401);
  const user = await getUser(ctx.env.PRICES_KV, email);
  if (!user || user.role !== "supplier" || !user.supplierProfile)
    return json({ error: "Not a supplier account" }, 403);
  if (user.locked) return json({ error: "Account locked — contact your administrator", locked: true }, 403);
  if (!user.supplierApproved) return json({ error: "Awaiting approval by the administrator" }, 403);

  let body: { items?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!Array.isArray(body.items)) return json({ error: "items must be an array" }, 400);
  const items = body.items
    .slice(0, MAX_ITEMS)
    .map((it: { material?: unknown; unit?: unknown; price?: unknown }) => ({
      material: typeof it.material === "string" ? it.material.trim().slice(0, 60) : "",
      unit: typeof it.unit === "string" ? it.unit.trim().slice(0, 30) : "",
      price: typeof it.price === "number" && isFinite(it.price) && it.price > 0 ? Math.round(it.price) : 0,
    }))
    .filter((it) => it.material && it.price > 0);
  if (!items.length) return json({ error: "Add at least one material with a price" }, 400);

  const listing: SupplierListing = {
    email,
    ...user.supplierProfile,
    items,
    updatedAt: new Date().toISOString(),
  };
  await ctx.env.PRICES_KV.put(`slisting:${email}`, JSON.stringify(listing));
  return json({ listing });
}
