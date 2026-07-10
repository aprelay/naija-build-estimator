import {
  EventContext,
  getUser,
  hashPassword,
  json,
  normEmail,
  publicProfile,
  randomHex,
  signToken,
  UserRecord,
} from "../../_lib";

export async function onRequestPost(ctx: EventContext): Promise<Response> {
  let body: {
    email?: unknown;
    password?: unknown;
    role?: unknown;
    businessName?: unknown;
    state?: unknown;
    whatsapp?: unknown;
  };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const email = normEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email) return json({ error: "Enter a valid email address" }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
  if (await getUser(ctx.env.PRICES_KV, email)) return json({ error: "Account already exists — log in instead" }, 409);
  const salt = randomHex(16);
  const user: UserRecord = {
    email,
    salt,
    hash: await hashPassword(password, salt),
    proUntil: null,
    createdAt: new Date().toISOString(),
  };
  if (body.role === "supplier") {
    const businessName = typeof body.businessName === "string" ? body.businessName.trim().slice(0, 80) : "";
    const state = typeof body.state === "string" ? body.state.trim().slice(0, 30) : "";
    const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp.trim().slice(0, 20) : "";
    if (!businessName || !state || !whatsapp)
      return json({ error: "Suppliers must provide business name, state and WhatsApp number" }, 400);
    user.role = "supplier";
    user.supplierApproved = false;
    user.supplierProfile = { businessName, state, whatsapp };
  }
  await ctx.env.PRICES_KV.put(`user:${email}`, JSON.stringify(user));
  const token = await signToken(ctx.env.ADMIN_KEY, email);
  return json({ token, user: publicProfile(user) });
}
