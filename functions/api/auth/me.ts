import { bearerToken, EventContext, getUser, json, publicProfile, verifyToken } from "../../_lib";

export async function onRequestGet(ctx: EventContext): Promise<Response> {
  const email = await verifyToken(ctx.env.ADMIN_KEY, bearerToken(ctx.request));
  if (!email) return json({ error: "Not logged in" }, 401);
  const user = await getUser(ctx.env.PRICES_KV, email);
  if (!user) return json({ error: "Account not found" }, 404);
  return json({ user: publicProfile(user) });
}
