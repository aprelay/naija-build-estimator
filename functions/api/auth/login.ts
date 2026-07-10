import { EventContext, getUser, hashPassword, json, normEmail, publicProfile, signToken } from "../../_lib";

export async function onRequestPost(ctx: EventContext): Promise<Response> {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const email = normEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return json({ error: "Enter email and password" }, 400);
  const user = await getUser(ctx.env.PRICES_KV, email);
  if (!user || (await hashPassword(password, user.salt)) !== user.hash) {
    return json({ error: "Incorrect email or password" }, 401);
  }
  const token = await signToken(ctx.env.ADMIN_KEY, email);
  return json({ token, user: publicProfile(user) });
}
